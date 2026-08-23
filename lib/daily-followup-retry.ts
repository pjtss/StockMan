import { getPool } from "@/lib/db";

export type DailyFollowupTask = "BOLLINGER" | "GOLDEN_CROSS";

export async function enqueueDailyFollowupRetry(market: "KR" | "US", task: DailyFollowupTask, error: string) {
  try {
    await getPool().query(`INSERT INTO daily_cache_followup_retries (market, task, status, next_attempt_at, last_error, updated_at) VALUES ($1,$2,'PENDING',NOW()+INTERVAL '5 minutes',$3,NOW()) ON CONFLICT (market,task) DO UPDATE SET status='PENDING', next_attempt_at=LEAST(daily_cache_followup_retries.next_attempt_at, EXCLUDED.next_attempt_at), last_error=EXCLUDED.last_error, attempts=daily_cache_followup_retries.attempts+1, updated_at=NOW()`, [market, task, error.slice(0, 2000)]);
  } catch (queueError) { console.warn(`[DailyFollowup] retry queue unavailable (${market}/${task}):`, queueError instanceof Error ? queueError.message : queueError); }
}

export async function markDailyFollowupRetrySuccess(market: "KR" | "US", task: DailyFollowupTask) {
  try { await getPool().query(`UPDATE daily_cache_followup_retries SET status='SUCCESS', succeeded_at=NOW(), updated_at=NOW() WHERE market=$1 AND task=$2`, [market, task]); }
  catch (error) { console.warn(`[DailyFollowup] retry success update unavailable (${market}/${task}):`, error instanceof Error ? error.message : error); }
}
