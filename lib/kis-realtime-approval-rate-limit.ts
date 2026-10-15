type Window = { startedAt: number; count: number };

const windows = new Map<string, Window>();
const MAX_CLIENTS = 4_096;
const WINDOW_MS = 60_000;
const PER_CLIENT_LIMIT = 120;
const GLOBAL_LIMIT = 1_800;

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
  if (!client.allowed) return client;
  return take("global", GLOBAL_LIMIT, now);
}

export function resetKisRealtimeApprovalLimitsForTest() {
  windows.clear();
}
