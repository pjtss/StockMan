import { getPool } from "@/lib/db";

type Input = { market: string; code: string; timeframe: "D" | "W" | "M"; error?: string; expectedAttempts?: number };
const RETRY_DELAYS = [5, 15, 60, 3600];
type EligibleInstrument = { market: string; code: string };
type RetryRow = { market: string; code: string; timeframe: "D" | "W" | "M"; attempts: number };
const VALID_TIMEFRAMES = ["D", "W", "M"] as const;

function normalizeTimeframes(timeframes?: string[]) {
  const requested = timeframes ?? [...VALID_TIMEFRAMES];
  return [...new Set(requested.filter((timeframe): timeframe is RetryRow["timeframe"] => VALID_TIMEFRAMES.includes(timeframe as RetryRow["timeframe"])))];
}

export async function enqueueCandleCacheRetry(input: Input) {
  const result = await getPool().query(`INSERT INTO instrument_candle_cache_retries (market, code, timeframe, status, next_attempt_at, last_error, updated_at) VALUES ($1,$2,$3,'PENDING',NOW()+($4 * INTERVAL '1 minute'),$5,NOW()) ON CONFLICT (market,code,timeframe) DO UPDATE SET status='PENDING', next_attempt_at=CASE WHEN instrument_candle_cache_retries.status='PROCESSING' THEN instrument_candle_cache_retries.next_attempt_at WHEN instrument_candle_cache_retries.status='SUCCESS' THEN EXCLUDED.next_attempt_at ELSE LEAST(instrument_candle_cache_retries.next_attempt_at, EXCLUDED.next_attempt_at) END, attempts=CASE WHEN instrument_candle_cache_retries.status='SUCCESS' THEN 0 ELSE instrument_candle_cache_retries.attempts END, last_error=EXCLUDED.last_error, succeeded_at=NULL, updated_at=NOW() WHERE ($6::integer IS NULL AND instrument_candle_cache_retries.status <> 'PROCESSING') OR (instrument_candle_cache_retries.status='PROCESSING' AND instrument_candle_cache_retries.attempts=$6)`, [input.market, input.code, input.timeframe, RETRY_DELAYS[0], input.error?.slice(0, 2000) ?? null, input.expectedAttempts ?? null]);
  return (result.rowCount ?? 0) > 0;
}

export async function markCandleCacheRetrySuccess(input: Omit<Input, "error"> & { attempts: number }) {
  try {
    const result = await getPool().query(`UPDATE instrument_candle_cache_retries SET status='SUCCESS', last_error=NULL, next_attempt_at=NOW(), succeeded_at=NOW(), updated_at=NOW() WHERE market=$1 AND code=$2 AND timeframe=$3 AND status='PROCESSING' AND attempts=$4`, [input.market, input.code, input.timeframe, input.attempts]);
    return (result.rowCount ?? 0) > 0;
  } catch (error) {
    console.warn("[CandleCache] retry success update unavailable:", error instanceof Error ? error.message : error);
    return false;
  }
}

export async function listDueCandleCacheRetryTimeframes(instruments: EligibleInstrument[]): Promise<Array<RetryRow["timeframe"]>> {
  const eligible = [...new Map(instruments.map((item) => [`${item.market.trim().toUpperCase()}:${item.code.trim().toUpperCase()}`, { market: item.market.trim().toUpperCase(), code: item.code.trim().toUpperCase() }])).values()];
  if (!eligible.length) return [];
  const result = await getPool().query(`WITH eligible AS (SELECT DISTINCT upper(e.market) AS market,upper(e.code) AS code FROM unnest($1::text[],$2::text[]) AS e(market,code)) SELECT DISTINCT r.timeframe FROM instrument_candle_cache_retries r JOIN eligible e ON upper(r.market)=e.market AND upper(r.code)=e.code WHERE r.timeframe=ANY($3::text[]) AND ((r.status='PENDING' AND r.next_attempt_at<=NOW()) OR (r.status='PROCESSING' AND (r.last_attempt_at IS NULL OR r.last_attempt_at<NOW()-INTERVAL '30 minutes')))`, [eligible.map((item) => item.market), eligible.map((item) => item.code), [...VALID_TIMEFRAMES]]);
  return (result.rows as Array<{ timeframe: RetryRow["timeframe"] }>).map((row) => row.timeframe);
}

export async function loadDueCandleCacheRetries(instruments: EligibleInstrument[], limit = 500, timeframes?: Array<RetryRow["timeframe"]>): Promise<RetryRow[]> {
  const eligible = [...new Map(instruments.map((item) => [`${item.market.trim().toUpperCase()}:${item.code.trim().toUpperCase()}`, { market: item.market.trim().toUpperCase(), code: item.code.trim().toUpperCase() }])).values()];
  const allowedTimeframes = normalizeTimeframes(timeframes);
  if (!eligible.length || !allowedTimeframes.length) return [];
  const result = await getPool().query(`WITH eligible AS (SELECT DISTINCT upper(e.market) AS market,upper(e.code) AS code FROM unnest($2::text[],$3::text[]) AS e(market,code)), lanes AS (SELECT timeframe, ($1 / cardinality($4::text[]) + CASE WHEN ordinality <= ($1 % cardinality($4::text[])) THEN 1 ELSE 0 END) AS quota FROM unnest($4::text[]) WITH ORDINALITY AS lane(timeframe,ordinality)), due AS (SELECT picked.id FROM lanes lane CROSS JOIN LATERAL (SELECT r.id FROM instrument_candle_cache_retries r JOIN eligible e ON upper(r.market)=e.market AND upper(r.code)=e.code WHERE r.timeframe=lane.timeframe AND ((r.status='PENDING' AND r.next_attempt_at<=NOW()) OR (r.status='PROCESSING' AND (r.last_attempt_at IS NULL OR r.last_attempt_at<NOW()-INTERVAL '30 minutes'))) ORDER BY r.next_attempt_at LIMIT lane.quota FOR UPDATE OF r SKIP LOCKED) picked), claimed AS (UPDATE instrument_candle_cache_retries r SET status='PROCESSING', attempts=r.attempts+1, last_attempt_at=NOW(), next_attempt_at=NOW()+(CASE WHEN r.attempts=0 THEN 5 WHEN r.attempts=1 THEN 15 WHEN r.attempts=2 THEN 60 ELSE 3600 END * INTERVAL '1 minute'), updated_at=NOW() FROM due WHERE r.id=due.id RETURNING r.market,r.code,r.timeframe,r.attempts) SELECT market,code,timeframe,attempts FROM claimed`, [limit, eligible.map((item) => item.market), eligible.map((item) => item.code), allowedTimeframes]);
  return result.rows as RetryRow[];
}
