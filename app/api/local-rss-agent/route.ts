import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";

export const dynamic = "force-dynamic";

const decisions = new Set(["POSITIVE", "MIXED", "NEUTRAL", "NEGATIVE", "INSUFFICIENT"]);
const tickerPattern = /^[A-Z][A-Z0-9.-]{0,9}$/;

function authorized(request: Request, method: "GET" | "POST") {
  const expected = (method === "GET" ? process.env.LOCAL_RSS_AGENT_READ_TOKEN : process.env.LOCAL_RSS_AGENT_WRITE_TOKEN)?.trim();
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  return Boolean(expected && supplied && supplied === expected);
}

function responseError(error: unknown) {
  console.error("[local-rss-agent] database operation failed", error instanceof Error ? error.message : "unknown error");
  return NextResponse.json({ ok: false, error: "LOCAL_RSS_AGENT_UNAVAILABLE" }, { status: 503 });
}

export async function GET(request: Request) {
  if (!authorized(request, "GET")) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const kind = params.get("kind") || "articles";
  const limitValue = Number(params.get("limit") || 20);
  const limit = Number.isSafeInteger(limitValue) ? Math.min(Math.max(limitValue, 1), 50) : 20;
  const pool = getPool();
  try {
    if (kind === "articles") {
      await pool.query(`INSERT INTO market_rss_llm_agent_state (state_key) VALUES ('codex-rss-monitor') ON CONFLICT (state_key) DO NOTHING`);
      const monitorState = await pool.query(`SELECT started_at AS "startedAt" FROM market_rss_llm_agent_state WHERE state_key='codex-rss-monitor'`);
      const result = await pool.query(`
        SELECT a.source, a.external_id AS "externalId", a.title, LEFT(a.summary, 5000) AS summary, LEFT(a.content, 12000) AS content, a.link,
          a.published_at AS "publishedAt", a.created_at AS "createdAt",
          md5(jsonb_build_array(a.source, a.external_id, a.title, COALESCE(a.summary,''),
            COALESCE(a.content,''), COALESCE(a.link,''), a.published_at)::text) AS "revisionHash"
        FROM market_rss_articles a
        WHERE a.created_at >= $2
          AND COALESCE(a.published_at, a.created_at) >= NOW() - INTERVAL '30 days'
          AND NOT EXISTS (
            SELECT 1 FROM market_rss_llm_analyses x
            WHERE x.source = a.source AND x.external_id = a.external_id
              AND x.revision_hash = md5(jsonb_build_array(a.source, a.external_id, a.title,
                COALESCE(a.summary,''), COALESCE(a.content,''), COALESCE(a.link,''), a.published_at)::text)
          )
        ORDER BY COALESCE(a.published_at, a.created_at) ASC, a.id ASC LIMIT $1`, [limit, monitorState.rows[0]?.startedAt]);
      return NextResponse.json({ ok: true, kind, startedAt: monitorState.rows[0]?.startedAt ?? null, count: result.rowCount, articles: result.rows }, { headers: { "cache-control": "no-store" } });
    }
    if (kind === "deliveries") {
      const result = await pool.query(`SELECT id, source, external_id AS "externalId", article_snapshot AS "article",
        ticker, ticker_status AS "tickerStatus", company_name AS "companyName", event_type AS "eventType", translated_title_ko AS "translatedTitleKo",
        analysis_ko AS "analysisKo", evidence_quotes AS "evidenceQuotes", risks_ko AS "risksKo",
        confidence, priority FROM market_rss_llm_analyses WHERE delivery_status = 'PENDING'
        ORDER BY analyzed_at ASC, id ASC LIMIT $1`, [limit]);
      return NextResponse.json({ ok: true, kind, count: result.rowCount, deliveries: result.rows }, { headers: { "cache-control": "no-store" } });
    }
    if (kind === "status") {
      const result = await pool.query(`SELECT delivery_status AS status, COUNT(*)::int AS count
        FROM market_rss_llm_analyses GROUP BY delivery_status ORDER BY delivery_status`);
      return NextResponse.json({ ok: true, kind, statuses: result.rows }, { headers: { "cache-control": "no-store" } });
    }
    return NextResponse.json({ ok: false, error: "INVALID_KIND" }, { status: 400 });
  } catch (error) { return responseError(error); }
}

export async function POST(request: Request) {
  if (!authorized(request, "POST")) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: "INVALID_JSON" }, { status: 400 }); }
  const pool = getPool();

  if (body?.kind === "analyses") {
    if (!Array.isArray(body.analyses) || body.analyses.length < 1 || body.analyses.length > 20) {
      return NextResponse.json({ ok: false, error: "INVALID_ANALYSES" }, { status: 400 });
    }
    const stored: Array<{ id: string; notify: boolean }> = [];
    try {
      for (const item of body.analyses) {
        if (!item || typeof item.source !== "string" || !item.source || typeof item.externalId !== "string" || !item.externalId
          || !/^[a-f0-9]{32}$/.test(item.revisionHash || "") || !decisions.has(item.decision)
          || !["HIGH", "MEDIUM", "LOW"].includes(item.confidence)
          || typeof item.eventType !== "string" || typeof item.translatedTitleKo !== "string" || !item.translatedTitleKo.trim()
          || typeof item.analysisKo !== "string" || !item.analysisKo.trim() || typeof item.risksKo !== "string"
          || !Array.isArray(item.evidenceQuotes) || item.evidenceQuotes.length > 8
          || item.evidenceQuotes.some((quote: unknown) => typeof quote !== "string" || quote.length > 500)
          || !Number.isInteger(item.priority) || item.priority < 0 || item.priority > 100) {
          return NextResponse.json({ ok: false, error: "INVALID_ANALYSIS" }, { status: 400 });
        }
        let ticker: string | null = typeof item.ticker === "string" && tickerPattern.test(item.ticker.trim().toUpperCase())
          ? item.ticker.trim().toUpperCase() : null;
        let companyName: string | null = null;
        let tickerStatus: string | null = null;
        if (ticker) {
          const eligible = await pool.query(`SELECT code, name FROM us_common_stock_universe
            WHERE UPPER(code) = $1 AND enabled = TRUE AND instrument_type = 'COMMON_STOCK'
              AND COALESCE(is_etf,FALSE)=FALSE AND COALESCE(is_warrant,FALSE)=FALSE
              AND COALESCE(is_derivative,FALSE)=FALSE AND COALESCE(is_dr,FALSE)=FALSE
              AND COALESCE(is_leveraged,FALSE)=FALSE AND COALESCE(is_inverse,FALSE)=FALSE LIMIT 1`, [ticker]);
          if (!eligible.rows[0]) ticker = null;
          else {
            companyName = eligible.rows[0].name;
            const priorTicker = await pool.query(`SELECT 1 FROM market_rss_llm_analyses WHERE ticker=$1 LIMIT 1`, [ticker]);
            tickerStatus = priorTicker.rows.length ? "EXISTING" : "NEW";
          }
        }
        const notify = item.decision === "POSITIVE" && ticker !== null;
        const deliveryStatus = notify ? "PENDING" : "NOT_REQUIRED";
        const result = await pool.query(`INSERT INTO market_rss_llm_analyses
          (source, external_id, revision_hash, article_snapshot, decision, ticker, ticker_status, company_name, event_type,
           translated_title_ko, analysis_ko, evidence_quotes, risks_ko, confidence, priority, notify, delivery_status)
          SELECT a.source, a.external_id, $3, jsonb_build_object('title',a.title,'summary',a.summary,'content',a.content,
            'link',a.link,'publishedAt',a.published_at), $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13, $14, $15, $16
          FROM market_rss_articles a
          WHERE a.source = $1 AND a.external_id = $2
            AND md5(jsonb_build_array(a.source,a.external_id,a.title,COALESCE(a.summary,''),COALESCE(a.content,''),
              COALESCE(a.link,''),a.published_at)::text) = $3
            AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text($10::jsonb) q(value)
              WHERE strpos(lower(concat_ws(' ',a.title,a.summary,a.content)),lower(q.value)) = 0)
          ON CONFLICT (source, external_id, revision_hash) DO NOTHING
          RETURNING id::text AS id, notify`, [item.source, item.externalId, item.revisionHash, item.decision,
          ticker, tickerStatus, companyName, item.eventType.slice(0, 120), item.translatedTitleKo.slice(0, 1000), item.analysisKo.slice(0, 6000),
          JSON.stringify(item.evidenceQuotes), item.risksKo.slice(0, 3000), item.confidence, item.priority, notify, deliveryStatus]);
        if (result.rows[0]) stored.push(result.rows[0]);
      }
      return NextResponse.json({ ok: true, stored: stored.length, analyses: stored });
    } catch (error) { return responseError(error); }
  }

  if (body?.kind === "delivery") {
    const id = String(body.id || "");
    const next = body.status;
    if (!/^\d+$/.test(id) || !["SENDING", "SENT", "FAILED", "UNCERTAIN"].includes(next)) {
      return NextResponse.json({ ok: false, error: "INVALID_DELIVERY_UPDATE" }, { status: 400 });
    }
    const expected = next === "SENDING" ? "PENDING" : "SENDING";
    try {
      const result = await pool.query(`UPDATE market_rss_llm_analyses SET delivery_status=$2,
        discord_message_id=COALESCE($3,discord_message_id), delivery_error=$4, delivery_updated_at=NOW()
        WHERE id=$1 AND delivery_status=$5 RETURNING id::text AS id, delivery_status AS status`,
      [id, next, typeof body.discordMessageId === "string" ? body.discordMessageId.slice(0, 100) : null,
        typeof body.error === "string" ? body.error.slice(0, 500) : null, expected]);
      if (!result.rows[0]) return NextResponse.json({ ok: false, error: "DELIVERY_STATE_CONFLICT" }, { status: 409 });
      return NextResponse.json({ ok: true, ...result.rows[0] });
    } catch (error) { return responseError(error); }
  }

  return NextResponse.json({ ok: false, error: "INVALID_KIND" }, { status: 400 });
}
