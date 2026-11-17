import { getPool } from "@/lib/db";
import { getKisCacheSourceTimestamp } from "@/lib/kis-cache";

type Input = { scope: "KR" | "US"; zone: "LOWER_OR_BELOW" | "MIDDLE_TO_LOWER"; error?: string; sourceCheckedAt?: string };
export class DailyBollingerRetrySupersededError extends Error {
  constructor() { super("BOLLINGER_RETRY_STATUS_SUPERSEDED_BY_NEWER_ATTEMPT"); }
}
export async function enqueueDailyBollingerRetry(input: Input) {
  try {
    const sourceCheckedAt = input.sourceCheckedAt;
    if (sourceCheckedAt != null && !Number.isFinite(Date.parse(sourceCheckedAt))) return false;
    await getPool().query(`INSERT INTO daily_bollinger_cache_retries (scope,zone,status,attempts,next_attempt_at,last_attempt_at,last_error,succeeded_at,updated_at) VALUES ($1,$2,'PENDING',1,NOW()+INTERVAL '5 minutes',COALESCE($4::timestamptz,NOW()),$3,NULL,NOW()) ON CONFLICT (scope,zone) DO UPDATE SET status='PENDING',attempts=daily_bollinger_cache_retries.attempts+1,next_attempt_at=NOW()+((LEAST(daily_bollinger_cache_retries.attempts+1,12)*5) * INTERVAL '1 minute'),last_attempt_at=COALESCE($4::timestamptz,NOW()),last_error=EXCLUDED.last_error,succeeded_at=NULL,updated_at=NOW() WHERE daily_bollinger_cache_retries.last_attempt_at IS NULL OR daily_bollinger_cache_retries.last_attempt_at < COALESCE($4::timestamptz,NOW())`, [input.scope, input.zone, input.error?.slice(0, 2000) ?? null, sourceCheckedAt ?? null]);
    return true;
  } catch (error) { console.warn("[BollingerCache] retry queue unavailable:", error instanceof Error ? error.message : error); return false; }
}
export async function markDailyBollingerRetrySuccess(input: Omit<Input, "error"> & { sourceCheckedAt: string }) {
  try {
    const result = await getPool().query(`INSERT INTO daily_bollinger_cache_retries (scope,zone,status,attempts,next_attempt_at,last_attempt_at,last_error,succeeded_at,updated_at) VALUES ($1,$2,'SUCCESS',0,NOW(),$3,NULL,NOW(),NOW()) ON CONFLICT (scope,zone) DO UPDATE SET status='SUCCESS',next_attempt_at=NOW(),last_attempt_at=EXCLUDED.last_attempt_at,last_error=NULL,succeeded_at=NOW(),updated_at=NOW() WHERE daily_bollinger_cache_retries.last_attempt_at IS NULL OR daily_bollinger_cache_retries.last_attempt_at < EXCLUDED.last_attempt_at OR (daily_bollinger_cache_retries.last_attempt_at = EXCLUDED.last_attempt_at AND daily_bollinger_cache_retries.status = 'SUCCESS') RETURNING scope`, [input.scope, input.zone, input.sourceCheckedAt]);
    return Number(result.rowCount ?? 0) > 0 ? "MARKED" as const : "SUPERSEDED" as const;
  } catch { return "ERROR" as const; }
}
export async function withDailyBollingerRetry<T>(input: Omit<Input, "error">, operation: (sourceCheckedAt: string) => Promise<T>): Promise<T> {
  let sourceCheckedAt: string;
  try { sourceCheckedAt = input.sourceCheckedAt ?? await getKisCacheSourceTimestamp(); }
  catch (error) {
    await enqueueDailyBollingerRetry({ ...input, error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
  try { return await operation(sourceCheckedAt); }
  catch (error) {
    await enqueueDailyBollingerRetry({ ...input, sourceCheckedAt, error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}
