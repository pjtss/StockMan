import { createHash } from "node:crypto";
import type { QueryResult } from "pg";
import { getPool } from "./db";
import { classifyRssTimestamp } from "./disclosure-timestamp-precision";


export const STOCKMAN_EVENT_ANALYSIS_VERSION = "stockman-event-analysis.v1";

export function parseSecAcceptanceTimestamp(value: string | null | undefined): Date | null {
  if (!value || !/^\d{14}$/.test(value)) return null;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  const hour = Number(value.slice(8, 10));
  const minute = Number(value.slice(10, 12));
  const second = Number(value.slice(12, 14));
  const wallClockUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const wallClock = new Date(wallClockUtc);
  if (wallClock.getUTCFullYear() !== year || wallClock.getUTCMonth() !== month - 1 || wallClock.getUTCDate() !== day
    || wallClock.getUTCHours() !== hour || wallClock.getUTCMinutes() !== minute || wallClock.getUTCSeconds() !== second) return null;
  // SEC acceptanceDateTime is an Eastern Time wall clock without an offset.
  // Derive the offset using IANA rules at the filing instant (EDGAR accepts filings
  // during the day, away from the DST transition boundary).
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", timeZoneName: "shortOffset", hour: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(wallClockUtc));
  const offsetName = parts.find((part) => part.type === "timeZoneName")?.value ?? "";
  const offset = /^GMT([+-])(\d{1,2})(?::(\d{2}))?$/.exec(offsetName);
  if (!offset) return null;
  const offsetMinutes = (offset[1] === "+" ? 1 : -1) * (Number(offset[2]) * 60 + Number(offset[3] || 0));
  return new Date(wallClockUtc - offsetMinutes * 60_000);
}

export function eventIdentityForSec(cik: string, accession: string) {
  return `SEC:${cik.replace(/\D/g, "").padStart(10, "0")}:${accession}`;
}

export function eventRevisionHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function getStockmanEventTimeWindow(asOf: Date, hours: number) {
  return { from: new Date(asOf.getTime() - hours * 3_600_000), to: new Date(asOf) };
}

export function isStockmanEventWithinWindow(value: Date, window: { from: Date; to: Date }) {
  const timestamp = value.getTime();
  return timestamp >= window.from.getTime() && timestamp <= window.to.getTime();
}

export function multiplyExactDecimalStrings(left: string, right: string): string {
  const parse = (value: string) => {
    if (!/^-?(?:0|[1-9]\d{0,25})(?:\.\d{1,12})?$/.test(value)) throw new Error("Invalid exact decimal");
    const negative = value.startsWith("-");
    const unsigned = negative ? value.slice(1) : value;
    const [whole, fraction = ""] = unsigned.split(".");
    return { coefficient: BigInt(`${whole}${fraction}`) * (negative ? BigInt(-1) : BigInt(1)), scale: fraction.length };
  };
  const a = parse(left);
  const b = parse(right);
  let product = a.coefficient * b.coefficient;
  const scale = a.scale + b.scale;
  if (scale > 12) {
    const divisor = BigInt(10) ** BigInt(scale - 12);
    if (product % divisor !== BigInt(0)) throw new Error("Exact product exceeds supported scale");
    product /= divisor;
    return formatDecimal(product, 12);
  }
  return formatDecimal(product, scale);
}

function formatDecimal(value: bigint, scale: number) {
  const negative = value < BigInt(0);
  const absolute = negative ? -value : value;
  const digits = absolute.toString().padStart(scale + 1, "0");
  if (!scale) return `${negative ? "-" : ""}${digits}`;
  const whole = digits.slice(0, -scale);
  const fraction = digits.slice(-scale).replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

const EXCHANGE_MARKETS = ["NASDAQ", "NAS", "NYSE", "NYS", "AMEX", "AMS"];

/** Stable, non-sensitive error categories safe for the public collection-status API. */
export function classifyStockmanEventError(error: unknown) {
  const code = error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  if (code === "42P01") {
    const message = error && typeof error === "object" && "message" in error ? String((error as { message?: unknown }).message ?? "") : "";
    const missingRelation = /relation\s+"([a-z0-9_]+)"\s+does not exist/i.exec(message)?.[1]?.toLowerCase();
    const knownRelations = new Set(["market_rss_articles", "market_rss_llm_analyses", "sec_submissions", "sec_companies", "sec_filing_events", "sec_filing_documents", "sec_codex_analysis_queue", "us_common_stock_universe", "stockman_events", "stockman_event_documents", "stockman_event_analyses", "stockman_event_history", "stockman_event_metrics"]);
    return missingRelation && knownRelations.has(missingRelation) ? `SCHEMA_TABLE_MISSING_${missingRelation.toUpperCase()}` : "SCHEMA_TABLE_MISSING";
  }
  if (code === "42703") return "SCHEMA_COLUMN_MISSING";
  if (code === "23505") return "UNIQUE_CONFLICT";
  if (code === "23503") return "FOREIGN_KEY_CONFLICT";
  if (code === "22P02") return "INVALID_SOURCE_DATA";
  if (code.startsWith("08")) return "DATABASE_UNAVAILABLE";
  return "DATABASE_ERROR";
}

function addFailureCode(counts: Record<string, number>, error: unknown) {
  const code = classifyStockmanEventError(error);
  counts[code] = (counts[code] ?? 0) + 1;
}

async function resolveActiveCommonTicker(tickers: string[], cik: string): Promise<string | null> {
  if (!tickers.length) return null;
  const pool = getPool();
  const result = await pool.query<{ code: string }>(
    `SELECT u.code FROM us_common_stock_universe u
     WHERE u.enabled = TRUE AND u.instrument_type = 'COMMON_STOCK' AND UPPER(u.code) = ANY($1::text[])
       AND UPPER(u.market) = ANY($2::text[])
       AND EXISTS (SELECT 1 FROM sec_companies c WHERE c.cik = $3 AND UPPER(u.code) = ANY(SELECT UPPER(unnest(c.tickers))))
     ORDER BY u.code LIMIT 1`,
    [tickers.map((ticker) => ticker.toUpperCase()), EXCHANGE_MARKETS, cik],
  );
  return result.rows[0]?.code.toUpperCase() ?? null;
}

async function appendEventHistory(client: import("pg").PoolClient, eventId: string, changeType: string, before: unknown, after: unknown, reason: string, evidenceUrl: string | null) {
  await client.query(
    `INSERT INTO stockman_event_history(event_id, change_type, before_state, after_state, reason, evidence_url)
     VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6)`,
    [eventId, changeType, before == null ? null : JSON.stringify(before), JSON.stringify(after), reason, evidenceUrl],
  );
}

async function persistSecEvent(row: {
  accession: string; cik: string; ticker: string; title: string; form: string; acceptedAt: Date | null;
  sourceUpdatedAt: Date;
  filingUrl: string; category: string; direction: string; score: number; matchedTerms: string[];
  primaryUrl: string | null; primaryText: string | null; analysis: Record<string, unknown> | null;
}) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const identityKey = eventIdentityForSec(row.cik, row.accession);
    const existing = await client.query<{ id: string; ticker: string | null; title: string; verification_status: string; event_status: string }>(
      `SELECT id::text, ticker, title, verification_status, event_status FROM stockman_events WHERE identity_key=$1 FOR UPDATE`, [identityKey]);
    let eventId = existing.rows[0]?.id;
    const nextState = { ticker: row.ticker, title: row.title, acceptedAt: row.acceptedAt?.toISOString() ?? null, sourceUrl: row.primaryUrl || row.filingUrl, category: row.category, direction: row.direction, score: row.score };
    if (!eventId) {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO stockman_events(identity_key,ticker,cik,accession_number,event_type,title,accepted_at,source_type,source_url,verification_status)
         VALUES($1,$2,$3,$4,$5,$6,$7,'SEC_EDGAR',$8,'VERIFIED')
         ON CONFLICT(identity_key) DO NOTHING RETURNING id::text`,
        [identityKey, row.ticker, row.cik, row.accession, row.category || row.form, row.title, row.acceptedAt, row.primaryUrl || row.filingUrl]);
      eventId = inserted.rows[0]?.id;
      if (!eventId) {
        const raced = await client.query<{ id: string }>(`SELECT id::text FROM stockman_events WHERE identity_key=$1 FOR UPDATE`, [identityKey]);
        eventId = raced.rows[0]?.id;
      }
      if (!eventId) throw new Error("SEC event identity conflict could not be resolved");
      await appendEventHistory(client, eventId, "CREATED", null, nextState, "SEC submission materialized", row.primaryUrl || row.filingUrl);
    } else {
      const prior = existing.rows[0];
      const changed = prior.ticker !== row.ticker || prior.title !== row.title;
      if (changed) {
        const before = { ticker: prior.ticker, title: prior.title, verificationStatus: prior.verification_status, eventStatus: prior.event_status };
        await client.query(`UPDATE stockman_events SET ticker=$2,title=$3,accepted_at=COALESCE(accepted_at,$4),source_url=$5,verification_status='VERIFIED',updated_at=NOW() WHERE id=$1`, [eventId, row.ticker, row.title, row.acceptedAt, row.primaryUrl || row.filingUrl]);
        await appendEventHistory(client, eventId, "SOURCE_REFRESH", before, nextState, "SEC source metadata changed", row.primaryUrl || row.filingUrl);
      }
    }
    await client.query(
      `INSERT INTO stockman_event_documents(event_id,source,external_id,document_type,cik,accession_number,published_at,accepted_at,source_url,verification_status,storage_reference,source_updated_at,content_hash)
       VALUES($1,'SEC_EDGAR',$2,$3,$4,$2,NULL,$5,$6,'VERIFIED',$7,$8,$9)
       ON CONFLICT(source,external_id) DO UPDATE SET event_id=EXCLUDED.event_id,document_type=EXCLUDED.document_type,accepted_at=COALESCE(stockman_event_documents.accepted_at,EXCLUDED.accepted_at),source_url=EXCLUDED.source_url,verification_status='VERIFIED',storage_reference=COALESCE(EXCLUDED.storage_reference,stockman_event_documents.storage_reference),source_updated_at=EXCLUDED.source_updated_at,content_hash=COALESCE(EXCLUDED.content_hash,stockman_event_documents.content_hash)`,
      [eventId, row.accession, row.form, row.cik, row.acceptedAt, row.primaryUrl || row.filingUrl, row.primaryText ? `sec_filing_documents:${row.accession}` : null, row.sourceUpdatedAt, row.primaryText ? createHash("sha256").update(row.primaryText).digest("hex") : null]);
    if (row.analysis) {
      const evidence = Array.isArray(row.analysis.evidence) ? row.analysis.evidence : [];
      const quotesSupportedByPrimaryText = Boolean(row.primaryText?.trim())
        && evidence.length > 0
        && evidence.every((quote) => typeof quote === "string" && row.primaryText!.includes(quote));
      const grade = row.analysis.decision === "POSITIVE" && quotesSupportedByPrimaryText ? "C" : "EXCLUDED";
      const analysis = {
        analysisVersion: STOCKMAN_EVENT_ANALYSIS_VERSION,
        grade,
        bullishReason: Array.isArray(row.analysis.catalysts) ? row.analysis.catalysts.join("; ") : "",
        bearishReason: Array.isArray(row.analysis.risks) ? row.analysis.risks.join("; ") : "",
        dilutionRisk: Array.isArray(row.analysis.risks) && row.analysis.risks.length ? "UNKNOWN" : null,
        keyMetrics: { confidence: row.analysis.confidence ?? null, evidenceQuotes: evidence },
        unknownFactors: row.analysis.limitations ?? [],
      };
      await client.query(
        `INSERT INTO stockman_event_analyses(event_id,analysis_version,revision_hash,bullish_grade,bullish_reason,bearish_reason,dilution_risk,key_metrics,unknown_factors)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb) ON CONFLICT(event_id,revision_hash) DO NOTHING`,
        [eventId, analysis.analysisVersion, eventRevisionHash(row.analysis), analysis.grade, analysis.bullishReason, analysis.bearishReason, analysis.dilutionRisk, JSON.stringify(analysis.keyMetrics), JSON.stringify(analysis.unknownFactors)]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** Materializes verified SEC filings from existing source tables; ticker eligibility fails closed. */
export async function materializeStockmanSecEvents(limit = 500, accessionFilter?: string) {
  const pool = getPool();
  const rows = await pool.query<{
    accession: string; cik: string; tickers: string[]; title: string; form: string; accepted: string | null; source_updated_at: Date;
    filing_url: string; category: string; direction: string; score: number; matched_terms: string[];
    primary_url: string | null; primary_text: string | null; analysis: Record<string, unknown> | null;
  }>(
    `SELECT s.accession,s.cik,c.tickers,COALESCE(s.primary_doc_description,s.form) AS title,s.form,s.acceptance_datetime AS accepted,
            s.filing_url,e.category,e.direction,e.score,e.matched_terms,d.primary_url,d.primary_text,q.result AS analysis,
            GREATEST(s.updated_at,COALESCE(d.fetched_at,s.updated_at),COALESCE(q.analyzed_at,s.updated_at)) AS source_updated_at
     FROM sec_submissions s JOIN sec_companies c ON c.cik=s.cik JOIN sec_filing_events e ON e.accession=s.accession
     LEFT JOIN sec_filing_documents d ON d.accession=s.accession
     LEFT JOIN sec_codex_analysis_queue q ON q.accession=s.accession AND q.status='COMPLETED'
     WHERE ($3::text IS NULL OR s.accession=$3)
       AND (NOT EXISTS (SELECT 1 FROM stockman_event_documents x WHERE x.source='SEC_EDGAR' AND x.external_id=s.accession)
       OR GREATEST(s.updated_at,COALESCE(d.fetched_at,s.updated_at),COALESCE(q.analyzed_at,s.updated_at)) > COALESCE((SELECT x.source_updated_at FROM stockman_event_documents x WHERE x.source='SEC_EDGAR' AND x.external_id=s.accession),'-infinity'::timestamptz))
       AND s.acceptance_datetime ~ '^[0-9]{14}$'
       AND EXISTS (SELECT 1 FROM us_common_stock_universe u WHERE u.enabled=TRUE AND u.instrument_type='COMMON_STOCK' AND UPPER(u.market)=ANY($2::text[]) AND UPPER(u.code)=ANY(SELECT UPPER(unnest(c.tickers))))
     ORDER BY s.acceptance_datetime DESC NULLS LAST,s.accession LIMIT $1`, [Math.min(2000, Math.max(1, limit)), EXCHANGE_MARKETS, accessionFilter ?? null]);
  let stored = 0;
  let unverified = 0;
  let failed = 0;
  const failureCodes: Record<string, number> = {};
  for (const row of rows.rows) {
    const acceptedAt = parseSecAcceptanceTimestamp(row.accepted);
    const ticker = await resolveActiveCommonTicker(row.tickers || [], row.cik);
    if (!ticker || !acceptedAt) { unverified++; continue; }
    try {
      await persistSecEvent({
        accession: row.accession,
        cik: row.cik,
        ticker,
        title: row.title,
        form: row.form,
        acceptedAt,
        sourceUpdatedAt: row.source_updated_at,
        filingUrl: row.filing_url,
        category: row.category,
        direction: row.direction,
        score: row.score,
        matchedTerms: row.matched_terms,
        primaryUrl: row.primary_url,
        primaryText: row.primary_text,
        analysis: row.analysis,
      });
      stored++;
    } catch (error) { failed++; addFailureCode(failureCodes, error); }
  }
  return { status: failed ? (stored ? "PARTIAL_SUCCESS" : "FAILED") : unverified ? (stored ? "PARTIAL_SUCCESS" : "UNVERIFIED") : "SUCCESS", fetched: rows.rows.length, stored, unverified, failed, failureCodes } as const;
}

/** Historical RSS records remain unverified until an official issuer/SEC document is linked. */
export async function materializeStockmanRssEvents(limit = 500, sourceFilter?: string, externalIdFilter?: string) {
  const pool = getPool();
  const result = await pool.query<{ id: string; source: string; external_id: string; title: string; link: string; ticker: string | null; category: string; published_at: Date | null; source_updated_at: Date; raw_payload: string | null; analysis: Record<string, unknown> | null }>(
    `SELECT a.id::text,a.source,a.external_id,a.title,a.link,a.detected_ticker AS ticker,a.category,a.published_at,a.raw_payload,
            GREATEST(a.updated_at,COALESCE(analysis.analyzed_at,a.updated_at)) AS source_updated_at,
            CASE WHEN analysis.id IS NULL THEN NULL ELSE jsonb_build_object(
              'decision',analysis.decision,'ticker',analysis.ticker,'eventType',analysis.event_type,
              'analysis',analysis.analysis_ko,'evidenceQuotes',analysis.evidence_quotes,
              'risks',analysis.risks_ko,'confidence',analysis.confidence,'revisionHash',analysis.revision_hash
            ) END AS analysis
     FROM market_rss_articles a LEFT JOIN stockman_event_documents prior ON prior.source=a.source AND prior.external_id=a.external_id
     LEFT JOIN LATERAL (SELECT x.* FROM market_rss_llm_analyses x WHERE x.source=a.source AND x.external_id=a.external_id ORDER BY x.analyzed_at DESC,x.id DESC LIMIT 1) analysis ON TRUE
     WHERE ($2::text IS NULL OR a.source=$2) AND ($3::text IS NULL OR a.external_id=$3)
       AND a.detected_ticker IS NOT NULL
       AND EXISTS (SELECT 1 FROM us_common_stock_universe u WHERE u.enabled=TRUE AND u.instrument_type='COMMON_STOCK' AND UPPER(u.code)=UPPER(a.detected_ticker) AND UPPER(u.market)=ANY($1::text[]))
       AND (prior.id IS NULL OR GREATEST(a.updated_at,COALESCE(analysis.analyzed_at,a.updated_at)) > COALESCE(prior.source_updated_at,'-infinity'::timestamptz))
     ORDER BY a.updated_at DESC,a.id DESC LIMIT $4`, [EXCHANGE_MARKETS, sourceFilter ?? null, externalIdFilter ?? null, Math.min(2000, Math.max(1, limit))]);
  let stored = 0;
  let failed = 0;
  const failureCodes: Record<string, number> = {};
  for (const row of result.rows) {
    const poolClient = await pool.connect();
    try {
      await poolClient.query("BEGIN");
      const identityKey = `RSS:${row.source}:${row.external_id}`;
      const prior = await poolClient.query<{ id: string; title: string; source_url: string; ticker: string | null; published_at: Date | null }>(
        `SELECT id::text,title,source_url,ticker,published_at FROM stockman_events WHERE identity_key=$1 FOR UPDATE`, [identityKey]);
      // A database Date does not prove that the source exposed an exact instant.
      // Require an explicit source time and timezone before using it in time windows.
      const timestamp = classifyRssTimestamp(row.raw_payload);
      const publishedAt = timestamp.precision === "INSTANT" && row.published_at instanceof Date && Number.isFinite(row.published_at.getTime()) ? row.published_at : null;
      const event = await poolClient.query<{ id: string }>(
        `INSERT INTO stockman_events(identity_key,ticker,event_type,title,published_at,source_type,source_url,verification_status)
         VALUES($1,$2,$3,$4,$5,$6,$7,'UNVERIFIED') ON CONFLICT(identity_key) DO UPDATE SET title=EXCLUDED.title,source_url=EXCLUDED.source_url,published_at=COALESCE(EXCLUDED.published_at,stockman_events.published_at),updated_at=NOW() RETURNING id::text`,
        [identityKey, row.ticker?.toUpperCase() ?? null, row.category, row.title, publishedAt, row.source, row.link]);
      const eventId = event.rows[0].id;
      const nextState = { ticker: row.ticker?.toUpperCase() ?? null, title: row.title, publishedAt: publishedAt?.toISOString() ?? null, timestampPrecision: timestamp.precision, sourceUrl: row.link };
      if (!prior.rows.length) await appendEventHistory(poolClient, eventId, "CREATED", null, nextState, "RSS article materialized as unverified", row.link || null);
      else if (prior.rows[0].title !== row.title || prior.rows[0].source_url !== row.link || prior.rows[0].ticker !== nextState.ticker || (publishedAt && prior.rows[0].published_at?.getTime() !== publishedAt.getTime())) {
        await appendEventHistory(poolClient, eventId, "SOURCE_REFRESH", prior.rows[0], nextState, "RSS source metadata changed", row.link || null);
      }
      await poolClient.query(
        `INSERT INTO stockman_event_documents(event_id,source,external_id,document_type,published_at,source_url,verification_status,storage_reference,source_updated_at,content_hash)
         VALUES($1,$2,$3,'RSS_ARTICLE',$4,$5,'UNVERIFIED',$6,$7,$8)
         ON CONFLICT(source,external_id) DO UPDATE SET source_url=EXCLUDED.source_url,storage_reference=EXCLUDED.storage_reference,published_at=COALESCE(EXCLUDED.published_at,stockman_event_documents.published_at),source_updated_at=EXCLUDED.source_updated_at,content_hash=COALESCE(EXCLUDED.content_hash,stockman_event_documents.content_hash)`,
        [eventId, row.source, row.external_id, publishedAt, row.link, `market_rss_articles:${row.id}`, row.source_updated_at, row.raw_payload ? createHash("sha256").update(row.raw_payload).digest("hex") : null]);
      if (row.analysis) {
        const analysisTicker = typeof row.analysis.ticker === "string" ? row.analysis.ticker.toUpperCase() : null;
        const evidenceQuotes = Array.isArray(row.analysis.evidenceQuotes) ? row.analysis.evidenceQuotes : [];
        const positive = row.analysis.decision === "POSITIVE" && analysisTicker === row.ticker?.toUpperCase() && evidenceQuotes.length > 0;
        await poolClient.query(
          `INSERT INTO stockman_event_analyses(event_id,analysis_version,revision_hash,bullish_grade,bullish_reason,bearish_reason,dilution_risk,key_metrics,unknown_factors)
           VALUES($1,$2,$3,$4,$5,$6,'UNKNOWN',$7::jsonb,'[]'::jsonb) ON CONFLICT(event_id,revision_hash) DO NOTHING`,
          [eventId, STOCKMAN_EVENT_ANALYSIS_VERSION, eventRevisionHash(row.analysis), positive ? "C" : "EXCLUDED",
            positive && typeof row.analysis.analysis === "string" ? row.analysis.analysis : "",
            typeof row.analysis.risks === "string" ? row.analysis.risks : "",
            JSON.stringify({ evidenceQuotes, sourceRevisionHash: row.analysis.revisionHash ?? null, confidence: row.analysis.confidence ?? null })]);
      }
      await poolClient.query("COMMIT");
      stored++;
    } catch (error) {
      await poolClient.query("ROLLBACK");
      failed++;
      addFailureCode(failureCodes, error);
    } finally { poolClient.release(); }
  }
  return { status: failed ? (stored ? "PARTIAL_SUCCESS" : "FAILED") : "SUCCESS", fetched: result.rows.length, stored, failed, failureCodes } as const;
}

export type StockmanEventQuery = {
  hours?: number | null; asOf?: Date; from?: Date | null; to?: Date | null; ticker?: string | null;
  eventType?: string | null; grade?: string | null; verificationStatus?: string | null;
  dilutionRisk?: string | null; dilutionOnly?: boolean; positiveOnly?: boolean; sort?: "latest" | "importance"; page?: number; pageSize?: number;
};

export async function listStockmanEvents(options: StockmanEventQuery = {}) {
  const pool = getPool();
  const page = options.page ?? 1;
  const pageSize = options.pageSize ?? 50;
  const values: unknown[] = [];
  const predicates = ["TRUE"];
  if (options.hours) {
    const asOf = options.asOf ?? new Date();
    const window = getStockmanEventTimeWindow(asOf, options.hours);
    values.push(window.from);
    predicates.push(`COALESCE(e.accepted_at,e.published_at) >= $${values.length}`);
    values.push(window.to);
    predicates.push(`COALESCE(e.accepted_at,e.published_at) <= $${values.length}`);
  } else if (options.from || options.to) {
    if (options.from) { values.push(options.from); predicates.push(`COALESCE(e.accepted_at,e.published_at) >= $${values.length}`); }
    if (options.to) { values.push(options.to); predicates.push(`COALESCE(e.accepted_at,e.published_at) <= $${values.length}`); }
  }
  for (const [value, expression] of [
    [options.ticker?.toUpperCase(), "UPPER(e.ticker) = $"],
    [options.eventType?.toUpperCase(), "UPPER(e.event_type) = $"],
    [options.verificationStatus?.toUpperCase(), "e.verification_status = $"],
    [options.grade?.toUpperCase(), "a.bullish_grade = $"],
    [options.dilutionRisk?.toUpperCase(), "UPPER(a.dilution_risk) = $"],
  ] as const) {
    if (value) { values.push(value); predicates.push(`${expression}${values.length}`); }
  }
  if (options.positiveOnly) predicates.push("e.verification_status='VERIFIED' AND a.bullish_grade IN ('A','B','C')");
  if (options.dilutionOnly) predicates.push("a.dilution_risk IS NOT NULL");
  const where = predicates.join(" AND ");
  const count = await pool.query<{ total: string }>(
    `SELECT COUNT(*)::text AS total FROM stockman_events e
     LEFT JOIN LATERAL (SELECT * FROM stockman_event_analyses a0 WHERE a0.event_id=e.id ORDER BY a0.analyzed_at DESC,a0.id DESC LIMIT 1) a ON TRUE WHERE ${where}`, values);
  const pageValues = [...values, pageSize, (page - 1) * pageSize];
  const orderBy = options.sort === "importance"
    ? `CASE a.bullish_grade WHEN 'A' THEN 4 WHEN 'B' THEN 3 WHEN 'C' THEN 2 WHEN 'EXCLUDED' THEN 1 ELSE 0 END DESC, CASE WHEN a.key_metrics->>'priority' ~ '^[0-9]+$' THEN (a.key_metrics->>'priority')::int ELSE 0 END DESC, COALESCE(e.accepted_at,e.published_at) DESC NULLS LAST,e.id DESC`
    : `COALESCE(e.accepted_at,e.published_at) DESC NULLS LAST,e.id DESC`;
  const rows = await pool.query(
    `SELECT e.id::text AS id,e.identity_key AS "identityKey",e.ticker,e.cik,e.accession_number AS "accessionNumber",e.related_event_id::text AS "relatedEventId",
       e.event_type AS "eventType",e.title,e.published_at AS "publishedAt",e.accepted_at AS "acceptedAt",e.first_seen_at AS "firstSeenAt",
       e.source_type AS "sourceType",e.source_url AS "sourceUrl",e.verification_status AS "verificationStatus",e.event_status AS "eventStatus",
       a.bullish_grade AS "bullishGrade",a.bullish_reason AS "bullishReason",a.bearish_reason AS "bearishReason",a.dilution_risk AS "dilutionRisk",
       a.key_metrics AS "keyMetrics",a.unknown_factors AS "unknownFactors",a.analysis_version AS "analysisVersion",a.analyzed_at AS "analyzedAt",
       COALESCE(e.accepted_at,e.published_at) AS "eventOccurredAt",m.metrics
     FROM stockman_events e
     LEFT JOIN LATERAL (SELECT * FROM stockman_event_analyses a0 WHERE a0.event_id=e.id ORDER BY a0.analyzed_at DESC,a0.id DESC LIMIT 1) a ON TRUE
     LEFT JOIN LATERAL (SELECT COALESCE(jsonb_agg(jsonb_build_object('metricKey',m0.metric_key,'amountValue',m0.amount_value::text,'quantityValue',m0.quantity_value::text,'currency',m0.currency,'unit',m0.unit,'asOfDate',m0.as_of_date,'splitAdjustment',m0.split_adjustment,'calculationFormula',m0.calculation_formula,'calculationInputs',m0.calculation_inputs) ORDER BY m0.created_at DESC,m0.id DESC),'[]'::jsonb) AS metrics FROM stockman_event_metrics m0 WHERE m0.event_id=e.id) m ON TRUE
     WHERE ${where} ORDER BY ${orderBy} LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    pageValues);
  const total = Number(count.rows[0]?.total ?? 0);
  return { items: rows.rows, total, page, pageSize, hasMore: page * pageSize < total };
}

export async function getStockmanEvent(id: number) {
  const pool = getPool();
  const event = await pool.query(
    `SELECT e.id::text AS id,e.identity_key AS "identityKey",e.ticker,e.cik,e.accession_number AS "accessionNumber",e.related_event_id::text AS "relatedEventId",
       e.event_type AS "eventType",e.title,e.published_at AS "publishedAt",e.accepted_at AS "acceptedAt",e.first_seen_at AS "firstSeenAt",
       e.source_type AS "sourceType",e.source_url AS "sourceUrl",e.verification_status AS "verificationStatus",e.event_status AS "eventStatus",
       a.bullish_grade AS "bullishGrade",a.bullish_reason AS "bullishReason",a.bearish_reason AS "bearishReason",a.dilution_risk AS "dilutionRisk",
       a.key_metrics AS "keyMetrics",a.unknown_factors AS "unknownFactors",a.analysis_version AS "analysisVersion",a.analyzed_at AS "analyzedAt",m.metrics
     FROM stockman_events e
     LEFT JOIN LATERAL (SELECT * FROM stockman_event_analyses a0 WHERE a0.event_id=e.id ORDER BY a0.analyzed_at DESC,a0.id DESC LIMIT 1) a ON TRUE
     LEFT JOIN LATERAL (SELECT COALESCE(jsonb_agg(jsonb_build_object('metricKey',m0.metric_key,'amountValue',m0.amount_value::text,'quantityValue',m0.quantity_value::text,'currency',m0.currency,'unit',m0.unit,'asOfDate',m0.as_of_date,'splitAdjustment',m0.split_adjustment,'calculationFormula',m0.calculation_formula,'calculationInputs',m0.calculation_inputs) ORDER BY m0.created_at DESC,m0.id DESC),'[]'::jsonb) AS metrics FROM stockman_event_metrics m0 WHERE m0.event_id=e.id) m ON TRUE
     WHERE e.id=$1`, [id]);
  if (!event.rows[0]) return null;
  const documents = await pool.query(
    `SELECT id::text AS id,source,external_id AS "externalId",document_type AS "documentType",cik,accession_number AS "accessionNumber",
       exhibit_number AS "exhibitNumber",published_at AS "publishedAt",accepted_at AS "acceptedAt",source_url AS "sourceUrl",
       content_hash AS "contentHash",verification_status AS "verificationStatus"
     FROM stockman_event_documents WHERE event_id=$1 ORDER BY accepted_at DESC NULLS LAST,published_at DESC NULLS LAST,id`, [id]);
  const analyses = await pool.query(
    `SELECT id::text AS id,analysis_version AS "analysisVersion",revision_hash AS "revisionHash",bullish_grade AS "bullishGrade",
       bullish_reason AS "bullishReason",bearish_reason AS "bearishReason",dilution_risk AS "dilutionRisk",key_metrics AS "keyMetrics",
       unknown_factors AS "unknownFactors",analyzed_at AS "analyzedAt" FROM stockman_event_analyses WHERE event_id=$1 ORDER BY analyzed_at DESC,id DESC`, [id]);
  const metrics = await pool.query(
    `SELECT id::text AS id,metric_key AS "metricKey",amount_value AS "amountValue",quantity_value AS "quantityValue",currency,unit,
       as_of_date AS "asOfDate",split_adjustment AS "splitAdjustment",calculation_formula AS "calculationFormula",calculation_inputs AS "calculationInputs"
     FROM stockman_event_metrics WHERE event_id=$1 ORDER BY created_at DESC,id DESC`, [id]);
  return { ...event.rows[0], documents: documents.rows, analyses: analyses.rows, metrics: metrics.rows };
}

export async function getStockmanEventHistory(id: number) {
  const pool = getPool();
  return pool.query(
    `SELECT id::text AS id,change_type AS "changeType",before_state AS "beforeState",after_state AS "afterState",reason,"evidence_url" AS "evidenceUrl",changed_at AS "changedAt"
     FROM stockman_event_history WHERE event_id=$1 ORDER BY changed_at DESC,id DESC`, [id]);
}

export async function listStockmanCollectionStatus() {
  const pool = getPool();
  const client = await pool.connect();
  let result: QueryResult<{ moduleKey: string; status: string; startedAt: Date; finishedAt: Date | null; eventLedger: unknown; sourceResults: unknown; submissionCoverage: unknown }>;
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL statement_timeout = '8s'");
    result = await client.query(
      `SELECT 'market-rss'::text AS "moduleKey",latest.status,latest.started_at AS "startedAt",latest.finished_at AS "finishedAt",
              latest.summary->'eventLedger' AS "eventLedger",latest.summary->'ingested'->'sourceResults' AS "sourceResults",
              latest.summary->'submissionCoverage' AS "submissionCoverage"
         FROM (SELECT status,started_at,finished_at,summary FROM automation_runs WHERE module_key='market-rss' ORDER BY started_at DESC LIMIT 1) latest
       UNION ALL
       SELECT 'sec-realtime'::text AS "moduleKey",latest.status,latest.started_at AS "startedAt",latest.finished_at AS "finishedAt",
              latest.summary->'eventLedger' AS "eventLedger",latest.summary->'ingested'->'sourceResults' AS "sourceResults",
              latest.summary->'submissionCoverage' AS "submissionCoverage"
         FROM (SELECT status,started_at,finished_at,summary FROM automation_runs WHERE module_key='sec-realtime' ORDER BY started_at DESC LIMIT 1) latest`);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
  const mapped: Array<{ moduleKey: string; status: string; sourceStatus: string; eventLedgerStatus: string; eventLedger: { status: string; fetched: number | null; stored: number | null; unverified: number | null; failed: number | null; failureCodes: Record<string, number>; errorCode: string | null }; sources: Array<{ source: unknown; status: string }>; startedAt: Date | null; finishedAt: Date | null }> = result.rows.map((row) => {
    const sourceResults = Array.isArray(row.sourceResults) ? row.sourceResults as Array<Record<string, unknown>> : [];
    const failures = sourceResults.filter((item) => item.ok !== true || ["FETCH_FAILED", "PERSIST_FAILED"].includes(String(item.ingestStatus))).length;
    const sourceStatus = sourceResults.length === 0
      ? row.moduleKey === "sec-realtime" && row.submissionCoverage && typeof row.submissionCoverage === "object"
        ? Number((row.submissionCoverage as Record<string, unknown>).fetchFailureCikCount ?? 0) > 0
          ? Number((row.submissionCoverage as Record<string, unknown>).fetchSuccessCikCount ?? 0) > 0 ? "PARTIAL_SUCCESS" : "FAILED"
          : Number((row.submissionCoverage as Record<string, unknown>).fetchSuccessCikCount ?? 0) > 0 ? "SUCCESS" : "UNVERIFIED"
        : "UNVERIFIED"
      : failures === 0 ? "SUCCESS" : failures < sourceResults.length ? "PARTIAL_SUCCESS" : "FAILED";
    const rawLedger = row.eventLedger && typeof row.eventLedger === "object" ? row.eventLedger as Record<string, unknown> : {};
    const ledgerStatus = typeof rawLedger.status === "string" ? rawLedger.status : "UNVERIFIED";
    const safeCount = (key: string) => typeof rawLedger[key] === "number" && Number.isSafeInteger(rawLedger[key]) && (rawLedger[key] as number) >= 0 ? rawLedger[key] as number : null;
    const rawFailureCodes = rawLedger.failureCodes && typeof rawLedger.failureCodes === "object" ? rawLedger.failureCodes as Record<string, unknown> : {};
    const failureCodes = Object.fromEntries(Object.entries(rawFailureCodes).filter(([code, count]) => /^[A-Z][A-Z0-9_]{0,63}$/.test(code) && typeof count === "number" && Number.isSafeInteger(count) && count > 0)) as Record<string, number>;
    const errorCode = typeof rawLedger.errorCode === "string" && /^[A-Z][A-Z0-9_]{0,63}$/.test(rawLedger.errorCode) ? rawLedger.errorCode : null;
    const statuses = [sourceStatus, ledgerStatus];
    const overallStatus = statuses.includes("FAILED") ? "FAILED"
      : statuses.includes("PARTIAL_SUCCESS") ? "PARTIAL_SUCCESS"
        : statuses.every((status) => status === "SUCCESS") ? "SUCCESS" : "UNVERIFIED";
    return {
      moduleKey: row.moduleKey,
      status: overallStatus,
      sourceStatus,
      eventLedgerStatus: ledgerStatus,
      eventLedger: { status: ledgerStatus, fetched: safeCount("fetched"), stored: safeCount("stored"), unverified: safeCount("unverified"), failed: safeCount("failed"), failureCodes, errorCode },
      sources: sourceResults.map((item) => ({ source: item.source, status: item.ok === true && !["FETCH_FAILED", "PERSIST_FAILED"].includes(String(item.ingestStatus)) ? "SUCCESS" : "FAILED" })),
      startedAt: row.startedAt,
      finishedAt: row.finishedAt,
    };
  });
  for (const moduleKey of ["market-rss", "sec-realtime"]) {
    if (!mapped.some((item) => item.moduleKey === moduleKey)) mapped.push({ moduleKey, status: "UNVERIFIED", sourceStatus: "UNVERIFIED", eventLedgerStatus: "UNVERIFIED", eventLedger: { status: "UNVERIFIED", fetched: null, stored: null, unverified: null, failed: null, failureCodes: {}, errorCode: null }, sources: [], startedAt: null, finishedAt: null });
  }
  return mapped;
}

export function renderStockmanEventsMarkdown(items: Array<Record<string, unknown>>, now = new Date()) {
  const kst = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "medium" });
  const lines = [`# Stockman 최근 호재 보고서`, ``, `- 기준 시각: ${kst.format(now)} KST`, `- 검증된 공식 원문과 티커가 연결된 A/B/C 분석만 수록`, ``];
  if (!items.length) lines.push("조회 조건에 맞는 검증된 호재가 없습니다.");
  for (const event of items) {
    const occurredAt = event.acceptedAt ?? event.publishedAt;
    const exactMetrics = Array.isArray(event.metrics) ? event.metrics as Array<Record<string, unknown>> : [];
    const metrics = exactMetrics.length
      ? exactMetrics.map((metric) => [
        `${metric.metricKey}: ${metric.amountValue ?? "미공개"} ${metric.currency ?? ""}`.trim(),
        metric.quantityValue == null ? "" : `${metric.quantityValue} ${metric.unit ?? "주"}`,
        metric.asOfDate ? `기준일 ${metric.asOfDate}` : "",
        metric.splitAdjustment ? `분할보정 ${metric.splitAdjustment}` : "",
        metric.calculationFormula ? `산식 ${metric.calculationFormula}` : "",
      ].filter(Boolean).join("; ")).join(" | ")
      : event.keyMetrics && typeof event.keyMetrics === "object" ? JSON.stringify(event.keyMetrics) : "미공개";
    lines.push(`## ${event.ticker ?? "티커 확인 필요"} — ${event.title}`);
    lines.push(`- 발표/접수시각: ${occurredAt ? kst.format(new Date(String(occurredAt))) + " KST" : "확인 필요"}`);
    lines.push(`- 유형 / 등급: ${event.eventType ?? "미분류"} / ${event.bullishGrade ?? "미평가"}`);
    lines.push(`- 핵심 수치: ${metrics}`);
    lines.push(`- 희석 위험: ${event.dilutionRisk ?? "UNKNOWN"}`);
    lines.push(`- 검증 상태: ${event.verificationStatus ?? "UNVERIFIED"}`);
    lines.push(`- 원문: ${event.sourceUrl ?? ""}`);
    lines.push(`- 미확인 사항: ${Array.isArray(event.unknownFactors) ? event.unknownFactors.join("; ") || "없음" : "없음"}`, "");
  }
  return lines.join("\n");
}
