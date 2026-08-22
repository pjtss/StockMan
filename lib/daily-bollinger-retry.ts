import { getPool } from "@/lib/db";

type Input = { scope: "KR" | "US"; zone: "LOWER_OR_BELOW" | "MIDDLE_TO_LOWER"; error?: string };
export async function enqueueDailyBollingerRetry(input: Input) {
  try { await getPool().query(`INSERT INTO daily_bollinger_cache_retries (scope,zone,status,attempts,next_attempt_at,last_attempt_at,last_error,updated_at) VALUES ($1,$2,'PENDING',1,NOW()+INTERVAL '5 minutes',NOW(),$3,NOW()) ON CONFLICT (scope,zone) DO UPDATE SET status='PENDING',attempts=daily_bollinger_cache_retries.attempts+1,next_attempt_at=NOW()+((LEAST(daily_bollinger_cache_retries.attempts+1,12)*5) * INTERVAL '1 minute'),last_attempt_at=NOW(),last_error=EXCLUDED.last_error,updated_at=NOW()`, [input.scope, input.zone, input.error?.slice(0, 2000) ?? null]); } catch (error) { console.warn("[BollingerCache] retry queue unavailable:", error instanceof Error ? error.message : error); }
}
export async function markDailyBollingerRetrySuccess(input: Omit<Input, "error">) {
  try { await getPool().query(`UPDATE daily_bollinger_cache_retries SET status='SUCCESS',succeeded_at=NOW(),updated_at=NOW() WHERE scope=$1 AND zone=$2`, [input.scope, input.zone]); } catch { /* observability only */ }
}
export async function withDailyBollingerRetry<T>(input: Omit<Input, "error">, operation: () => Promise<T>): Promise<T> {
  try { return await operation(); }
  catch (error) {
    await enqueueDailyBollingerRetry({ ...input, error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}
