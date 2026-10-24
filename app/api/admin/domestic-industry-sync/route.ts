import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { getPool } from "@/lib/db";
import { fetchDomesticStockInfo } from "@/lib/kis-investor-flow";
import { getAccessToken } from "@/lib/kis-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readKeyAuthorized(request: Request) {
  const expected = process.env.DAILY_CACHE_READ_API_KEY?.trim();
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  return Boolean(expected && supplied && supplied === expected);
}

async function authorizedRead(request: Request) {
  return (await requireAdminSession()) || readKeyAuthorized(request);
}

export async function GET(request: Request) {
  if (!(await authorizedRead(request))) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  try {
    const result = await getPool().query(`
      SELECT COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE standard_industry_code <> '')::int AS completed,
        COUNT(*) FILTER (WHERE standard_industry_code = '')::int AS missing,
        COUNT(*) FILTER (WHERE standard_industry_code <> '' AND standard_industry_name = '')::int AS missing_name
      FROM kr_common_stock_universe
      WHERE enabled = TRUE AND instrument_type = 'COMMON_STOCK'
    `);
    return NextResponse.json({ ok: true, source: "OPERATING_DB_ACTIVE_COMMON_STOCK_UNIVERSE", ...result.rows[0] }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("[domestic-industry-sync] status query failed", error instanceof Error ? error.message.slice(0, 300) : "unknown error");
    return NextResponse.json({ ok: false, error: "INDUSTRY_SYNC_STATUS_UNAVAILABLE" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  if (!(await requireAdminSession())) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const offset = Number(body.offset);
  const expectedTotal = Number(body.expectedTotal);
  const batchSize = Number(body.batchSize ?? 10);
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(expectedTotal) || expectedTotal < 1 || !Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 20) {
    return NextResponse.json({ ok: false, error: "INVALID_BATCH" }, { status: 400 });
  }

  try {
    const pool = getPool();
    const universe = await pool.query(`
      SELECT market, code, standard_code, standard_industry_code
      FROM kr_common_stock_universe
      WHERE enabled = TRUE AND instrument_type = 'COMMON_STOCK'
      ORDER BY market, code
    `);
    if (universe.rowCount !== expectedTotal) return NextResponse.json({ ok: false, error: "UNIVERSE_COUNT_CHANGED", expectedTotal, currentTotal: universe.rowCount }, { status: 409 });
    if (offset >= expectedTotal) return NextResponse.json({ ok: false, error: "OFFSET_OUT_OF_RANGE" }, { status: 400 });
    const page = universe.rows.slice(offset, offset + batchSize);
    const targets = page.filter((row: { standard_industry_code: string }) => !row.standard_industry_code);
    const token = targets.length ? await getAccessToken() : null;
    if (targets.length && !token) return NextResponse.json({ ok: false, error: "KIS_TOKEN_UNAVAILABLE" }, { status: 503 });

    const values: Array<{ market: string; code: string; industryCode: string; industryName: string }> = [];
    for (const target of targets) {
      const response = await fetchDomesticStockInfo(token!, target.code);
      const item = response.rows[0];
      const industryCode = String(item?.std_idst_clsf_cd ?? "").trim();
      const industryName = String(item?.std_idst_clsf_cd_name ?? "").trim();
      const standardCode = String(item?.std_pdno ?? "").trim();
      // KRX-issued domestic issue codes can contain letters (for example 0001A0).
      // Keep industry classification codes numeric while accepting official 6-character tickers.
      const checks = {
        tickerFormat: /^[0-9A-Z]{6}$/.test(target.code),
        kisResponse: response.ok,
        industryCode: /^\d{6}$/.test(industryCode),
        industryNamePresent: Boolean(industryName),
        standardCode: Boolean(standardCode),
        standardCodeMatch: !target.standard_code || target.standard_code === standardCode,
      };
      // KIS may return a valid standard industry code while omitting its name.
      // The requested code remains authoritative; persist the name as empty rather than
      // discarding an otherwise valid common-stock classification.
      if (!checks.tickerFormat || !checks.kisResponse || !checks.industryCode || !checks.standardCode || !checks.standardCodeMatch) {
        return NextResponse.json({ ok: false, error: "KIS_STOCK_INFO_INVALID", failedCode: target.code, providerCode: response.msgCd, checks }, { status: 502 });
      }
      values.push({ market: target.market, code: target.code, industryCode, industryName });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const item of values) {
        const saved = await client.query(`
          UPDATE kr_common_stock_universe
          SET standard_industry_code = $3, standard_industry_name = $4, updated_at = NOW()
          WHERE market = $1 AND code = $2 AND enabled = TRUE AND instrument_type = 'COMMON_STOCK'
          RETURNING code
        `, [item.market, item.code, item.industryCode, item.industryName]);
        if (saved.rowCount !== 1) throw new Error("UNIVERSE_ROW_CHANGED_DURING_SYNC");
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    return NextResponse.json({ ok: true, offset, processed: values.length, skippedAlreadyComplete: page.length - values.length, nextOffset: offset + page.length, total: expectedTotal });
  } catch (error) {
    console.error("[domestic-industry-sync] batch failed", error instanceof Error ? error.message.slice(0, 300) : "unknown error");
    return NextResponse.json({ ok: false, error: "INDUSTRY_SYNC_BATCH_FAILED" }, { status: 502 });
  }
}
