import { getPool } from "@/lib/db";

type Input = { market: string; code: string; timeframe: "D" | "W" | "M"; error?: string };
const RETRY_DELAYS = [5, 15, 60, 3600];

export async function enqueueCandleCacheRetry(input: Input) {
  try { await getPool().query(`INSERT INTO instrument_candle_cache_retries (market, code, timeframe, status, next_attempt_at, last_error, updated_at) VALUES ($1,$2,$3,'PENDING',NOW()+($4 * INTERVAL '1 minute'),$5,NOW()) ON CONFLICT (market,code,timeframe) DO UPDATE SET status='PENDING', next_attempt_at=LEAST(instrument_candle_cache_retries.next_attempt_at, EXCLUDED.next_attempt_at), last_error=EXCLUDED.last_error, updated_at=NOW()`, [input.market, input.code, input.timeframe, RETRY_DELAYS[0], input.error?.slice(0, 2000) ?? null]); } catch (error) { console.warn("[CandleCache] retry queue unavailable:", error instanceof Error ? error.message : error); }
}

export async function markCandleCacheRetrySuccess(input: Omit<Input, "error">) {
  try { await getPool().query(`UPDATE instrument_candle_cache_retries SET status='SUCCESS', succeeded_at=NOW(), updated_at=NOW() WHERE market=$1 AND code=$2 AND timeframe=$3`, [input.market, input.code, input.timeframe]); } catch (error) { console.warn("[CandleCache] retry success update unavailable:", error instanceof Error ? error.message : error); }
}

export async function loadDueCandleCacheRetries(limit = 500) {
  try { const result = await getPool().query(`SELECT market,code,timeframe,attempts FROM instrument_candle_cache_retries WHERE status='PENDING' AND next_attempt_at<=NOW() ORDER BY next_attempt_at LIMIT $1`, [limit]); return result.rows as Array<{market:string;code:string;timeframe:"D"|"W"|"M";attempts:number}>; } catch { return []; }
}
