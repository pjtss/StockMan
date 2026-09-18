import { getPool } from "@/lib/db";
export type IntradayTickMetrics = { runId: string; tickId: string; workerStatus: string; plannedCount: number; executedCount: number; deferredCount: number; throttledCount: number; failedCount: number; queueDepth: number; observedAt: Date; durationMs: number };
export async function recordIntradayTick(m: IntradayTickMetrics) { try { const pool=getPool(); await pool.query(`WITH run_upsert AS (INSERT INTO intraday_detection_runs (run_id,worker_status,evaluation_version,started_at,finished_at) VALUES ($1,$2,'intraday-v1',$3,$3) ON CONFLICT (run_id) DO UPDATE SET worker_status=EXCLUDED.worker_status,finished_at=EXCLUDED.finished_at RETURNING run_id) INSERT INTO intraday_detection_ticks (run_id,tick_id,planned_count,executed_count,deferred_count,throttled_count,failed_count,queue_depth,observed_at,duration_ms) SELECT run_id,$4,$5,$6,$7,$8,$9,$10,$11,$12 FROM run_upsert ON CONFLICT (tick_id) DO NOTHING`,[m.runId,m.workerStatus,m.observedAt,m.tickId,m.plannedCount,m.executedCount,m.deferredCount,m.throttledCount,m.failedCount,m.queueDepth,m.observedAt,m.durationMs]); } catch(e) { console.warn("[Intraday] tick history unavailable:",e instanceof Error?e.message:e); } }
export type IntradayTransition = { tickId: string; market: string; code: string; fromState?: string; toState: string; observedAt: Date; dedupeKey: string };

export async function recordIntradayTransitions(inputs: IntradayTransition[]) {
  if (inputs.length === 0) return;
  try {
    const pool = getPool();
    for (let start = 0; start < inputs.length; start += 500) {
      const chunk = inputs.slice(start, start + 500);
      const values: string[] = [];
      const params: unknown[] = [];
      chunk.forEach((input, index) => {
        const offset = index * 7;
        values.push(`($${offset + 1},$${offset + 2},$${offset + 3},$${offset + 4},$${offset + 5},'intraday-v1',$${offset + 6},$${offset + 7})`);
        params.push(input.tickId, input.market, input.code, input.fromState ?? null, input.toState, input.observedAt, input.dedupeKey);
      });
      await pool.query(`INSERT INTO intraday_detection_transitions (tick_id,market,code,from_state,to_state,evaluation_version,observed_at,dedupe_key) VALUES ${values.join(",")} ON CONFLICT DO NOTHING`, params);
    }
  } catch (e) { console.warn("[Intraday] transition history unavailable:", e instanceof Error ? e.message : e); }
}

export async function recordIntradayTransition(input: IntradayTransition) { return recordIntradayTransitions([input]); }
