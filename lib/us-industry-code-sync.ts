import { getPool } from "@/lib/db";
import { classifyUs, parseOverseas } from "@/lib/instrument-universe-import";

export const KIS_US_MASTER_FILES = {
  NAS: "NASMST.COD",
  NYS: "NYSMST.COD",
  AMS: "AMSMST.COD",
} as const;

type Market = keyof typeof KIS_US_MASTER_FILES;
type IndustryRow = { market: Market; code: string; industryCode: string; sourceFile: string };

/** Parse only KIS-master-confirmed active U.S. common stocks. No name-based fallback. */
export function buildKisUsIndustryRows(files: Partial<Record<Market, Buffer>>) {
  const rows: IndustryRow[] = [];
  const sourceCounts: Record<Market, number> = { NAS: 0, NYS: 0, AMS: 0 };
  const eligibleCounts: Record<Market, number> = { NAS: 0, NYS: 0, AMS: 0 };
  const unclassifiedCounts: Record<Market, number> = { NAS: 0, NYS: 0, AMS: 0 };

  for (const market of Object.keys(KIS_US_MASTER_FILES) as Market[]) {
    const fileName = KIS_US_MASTER_FILES[market];
    const buffer = files[market];
    if (!buffer?.length) throw new Error(`KIS_MASTER_REQUIRED:${fileName}`);
    const parsed = parseOverseas(buffer, market, fileName);
    if (!parsed.length) throw new Error(`KIS_MASTER_EMPTY:${fileName}`);
    const lineCount = new TextDecoder("euc-kr").decode(buffer).split(/\r?\n/).filter((line) => line.trim().length > 0).length;
    if (parsed.length !== lineCount) throw new Error(`KIS_MASTER_MALFORMED_ROWS:${fileName}`);
    if (parsed.some((row) => row.rawPayload.split("\t").length !== 24 || row.rawPayload.split("\t")[2]?.trim() !== market)) {
      throw new Error(`KIS_MASTER_SCHEMA_OR_MARKET_MISMATCH:${fileName}`);
    }
    sourceCounts[market] = parsed.length;
    const seen = new Set<string>();
    for (const row of parsed) {
      if (seen.has(row.code)) throw new Error(`KIS_MASTER_DUPLICATE_TICKER:${market}:${row.code}`);
      seen.add(row.code);
      if (row.securityType !== "2") continue;
      if (row.isDr || row.etpType.trim() || row.isEtf || row.isWarrant || row.isDerivative) continue;
      if (classifyUs(row).instrumentType !== "COMMON_STOCK") continue;
      eligibleCounts[market] += 1;
      const industryCode = row.industryCode.trim();
      if (!/^\d{3}$/.test(industryCode) || industryCode === "000") {
        unclassifiedCounts[market] += 1;
      }
      rows.push({ market, code: row.code, industryCode, sourceFile: fileName });
    }
    if (eligibleCounts[market] === 0) throw new Error(`KIS_MASTER_NO_COMMON_STOCKS:${fileName}`);
  }

  return { rows, sourceCounts, eligibleCounts, unclassifiedCounts };
}

/** Update only the existing common-stock partition, in one transaction per market. */
export async function syncKisUsIndustryCodes(files: Partial<Record<Market, Buffer>>) {
  const prepared = buildKisUsIndustryRows(files);
  let stage = "database_connect";
  const client = await getPool().connect();
  try {
    stage = "begin_transaction";
    await client.query("BEGIN");
    const persistedCounts: Record<Market, number> = { NAS: 0, NYS: 0, AMS: 0 };
    for (const market of Object.keys(KIS_US_MASTER_FILES) as Market[]) {
      stage = `update_${market}`;
      const marketRows = prepared.rows.filter((row) => row.market === market);
      const result = await client.query(
        `UPDATE us_common_stock_universe AS u
         SET industry_code = src.industry_code,
             source_file = src.source_file,
             updated_at = NOW()
         FROM jsonb_to_recordset($1::jsonb)
           AS src(market text, code text, industry_code text, source_file text)
         WHERE u.market = src.market
           AND u.code = src.code
           AND u.enabled = TRUE
           AND u.instrument_type = 'COMMON_STOCK'`,
        [JSON.stringify(marketRows)],
      );
      persistedCounts[market] = result.rowCount ?? 0;
    }
    stage = "verify_database_coverage";
    const coverage = await client.query(`
      SELECT market, COUNT(*)::int AS active_common_count,
        COUNT(*) FILTER (WHERE industry_code ~ '^[0-9]{3}$' AND industry_code <> '000')::int AS classified_count,
        COUNT(*) FILTER (WHERE industry_code IS NULL OR industry_code !~ '^[0-9]{3}$' OR industry_code = '000')::int AS unclassified_count
      FROM us_common_stock_universe
      WHERE enabled = TRUE AND instrument_type = 'COMMON_STOCK' AND market IN ('NAS','NYS','AMS')
      GROUP BY market ORDER BY market
    `);
    stage = "commit_transaction";
    await client.query("COMMIT");
    const unmatchedCounts = Object.fromEntries((Object.keys(KIS_US_MASTER_FILES) as Market[]).map((market) => [market, Math.max(0, prepared.eligibleCounts[market] - persistedCounts[market])])) as Record<Market, number>;
    return { ok: true, source: "KIS_US_MASTER_ICOD", ...prepared, persistedCounts, unmatchedCounts, dbCoverage: coverage.rows };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    if (error && typeof error === "object") Object.assign(error, { usIndustrySyncStage: stage });
    throw error;
  } finally {
    client.release();
  }
}
