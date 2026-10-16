type Window = { startedAt: number; count: number };

const windows = new Map<string, Window>();
const MAX_CLIENTS = 4_096;
const WINDOW_MS = 60_000;
const PER_CLIENT_LIMIT = 120;
const GLOBAL_LIMIT = 1_800;
const METRIC_RETENTION_MINUTES = 60;

type MinuteMetrics = {
  accepted: number;
  rejectedClient: number;
  rejectedGlobal: number;
  retryAfter1To10: number;
  retryAfter11To30: number;
  retryAfter31To60: number;
};
const minuteMetrics = new Map<number, MinuteMetrics>();

function recordMetric(now: number, outcome: "accepted" | "rejectedClient" | "rejectedGlobal", retryAfterSeconds = 0) {
  const minute = Math.floor(now / 60_000) * 60_000;
  let bucket = minuteMetrics.get(minute);
  if (!bucket) {
    bucket = { accepted: 0, rejectedClient: 0, rejectedGlobal: 0, retryAfter1To10: 0, retryAfter11To30: 0, retryAfter31To60: 0 };
    minuteMetrics.set(minute, bucket);
  }
  bucket[outcome] += 1;
  if (outcome !== "accepted") {
    if (retryAfterSeconds <= 10) bucket.retryAfter1To10 += 1;
    else if (retryAfterSeconds <= 30) bucket.retryAfter11To30 += 1;
    else bucket.retryAfter31To60 += 1;
  }
  const oldestMinute = minute - (METRIC_RETENTION_MINUTES - 1) * 60_000;
  for (const existingMinute of minuteMetrics.keys()) {
    if (existingMinute < oldestMinute) minuteMetrics.delete(existingMinute);
  }
}

function take(key: string, limit: number, now: number) {
  const current = windows.get(key);
  if (!current || now - current.startedAt >= WINDOW_MS) {
    windows.set(key, { startedAt: now, count: 1 });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  if (current.count >= limit) {
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((WINDOW_MS - (now - current.startedAt)) / 1_000)) };
  }
  current.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

function prune(now: number) {
  if (windows.size < MAX_CLIENTS + 1) return;
  for (const [key, window] of windows) {
    if (now - window.startedAt >= WINDOW_MS) windows.delete(key);
  }
  while (windows.size >= MAX_CLIENTS + 1) {
    let oldestClient: string | undefined;
    for (const key of windows.keys()) {
      if (key !== "global") {
        oldestClient = key;
        break;
      }
    }
    if (!oldestClient) break;
    windows.delete(oldestClient);
  }
}

/** Single-instance guard for the public chart websocket-ticket endpoint. */
export function consumeKisRealtimeApprovalLimit(clientIp: string, now = Date.now()) {
  prune(now);
  const client = take(`client:${clientIp || "unknown"}`, PER_CLIENT_LIMIT, now);
  if (!client.allowed) {
    recordMetric(now, "rejectedClient", client.retryAfterSeconds);
    return client;
  }
  const global = take("global", GLOBAL_LIMIT, now);
  if (!global.allowed) {
    recordMetric(now, "rejectedGlobal", global.retryAfterSeconds);
    return global;
  }
  recordMetric(now, "accepted");
  return global;
}

/** Aggregate-only telemetry; deliberately contains no client IPs or request identifiers. */
export function getKisRealtimeApprovalRateLimitMetrics(now = Date.now()) {
  const currentMinute = Math.floor(now / 60_000) * 60_000;
  const firstMinute = currentMinute - (METRIC_RETENTION_MINUTES - 1) * 60_000;
  const minutes = Array.from({ length: METRIC_RETENTION_MINUTES }, (_, index) => {
    const start = firstMinute + index * 60_000;
    const metric = minuteMetrics.get(start);
    return {
      minute: new Date(start).toISOString(),
      accepted: metric?.accepted ?? 0,
      rejectedClient: metric?.rejectedClient ?? 0,
      rejectedGlobal: metric?.rejectedGlobal ?? 0,
    };
  });
  const totals = [...minuteMetrics.entries()].reduce((result, [minute, metric]) => {
    if (minute < firstMinute || minute > currentMinute) return result;
    result.accepted += metric.accepted;
    result.rejectedClient += metric.rejectedClient;
    result.rejectedGlobal += metric.rejectedGlobal;
    result.retryAfter1To10 += metric.retryAfter1To10;
    result.retryAfter11To30 += metric.retryAfter11To30;
    result.retryAfter31To60 += metric.retryAfter31To60;
    return result;
  }, { accepted: 0, rejectedClient: 0, rejectedGlobal: 0, retryAfter1To10: 0, retryAfter11To30: 0, retryAfter31To60: 0 });
  return {
    retentionMinutes: METRIC_RETENTION_MINUTES,
    policy: { windowSeconds: WINDOW_MS / 1_000, perClientLimit: PER_CLIENT_LIMIT, globalLimit: GLOBAL_LIMIT },
    generatedAt: new Date(now).toISOString(),
    totals,
    minutes,
  };
}

export function resetKisRealtimeApprovalLimitsForTest() {
  windows.clear();
  minuteMetrics.clear();
}
