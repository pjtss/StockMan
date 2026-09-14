import { getPool } from "@/lib/db";
import { BoundedWriteQueue } from "@/lib/bounded-write-queue";

export type KisRateLimitEvent = {
  runId?: string;
  tickId?: string;
  requestId: string;
  endpoint: string;
  market?: string;
  trId: string;
  httpStatus?: number | null;
  kisRtCd?: string | null;
  kisMsgCd?: string | null;
  kisMsg1Code?: string | null;
  limitType: "KIS_429" | "KIS_BUSINESS_RATE_LIMIT" | "LOCAL_THROTTLE" | "UNKNOWN_RATE_LIMIT";
  limitScope: "ACCOUNT" | "APPKEY" | "ENDPOINT" | "TR_ID" | "GLOBAL";
  observedTps?: number | null;
  configuredTps: number;
  retryAfterMs?: number | null;
  backoffMs?: number | null;
  attempt?: number;
  breakerState?: string | null;
  queuedCount?: number | null;
  inflightCount?: number | null;
  budgetRemaining?: number | null;
  incidentId: string;
};

const queue = new BoundedWriteQueue<KisRateLimitEvent>(async (event) => {
  await getPool().query(`INSERT INTO kis_rate_limit_events (run_id, tick_id, request_id, endpoint, market, tr_id, http_status, kis_rt_cd, kis_msg_cd, kis_msg1_code, limit_type, limit_scope, observed_tps, configured_tps, retry_after_ms, backoff_ms, attempt, breaker_state, queued_count, inflight_count, budget_remaining, incident_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`, [event.runId ?? null, event.tickId ?? null, event.requestId, event.endpoint, event.market ?? null, event.trId, event.httpStatus ?? null, event.kisRtCd ?? null, event.kisMsgCd ?? null, event.kisMsg1Code ?? null, event.limitType, event.limitScope, event.observedTps ?? null, event.configuredTps, event.retryAfterMs ?? null, event.backoffMs ?? null, event.attempt ?? 1, event.breakerState ?? null, event.queuedCount ?? null, event.inflightCount ?? null, event.budgetRemaining ?? null, event.incidentId]);
});

export function recordKisRateLimitEvent(event: KisRateLimitEvent) {
  void queue.enqueue(event).catch((error) => console.warn("[Debug] KIS rate-limit history unavailable:", error instanceof Error ? error.message : error));
}
