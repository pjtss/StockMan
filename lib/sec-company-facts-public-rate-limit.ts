type Window = { startedAt: number; count: number };

const windows = new Map<string, Window>();
const MAX_WINDOWS = 4_096;

const LIMITS = {
  lookup: { perClient: 6, perClientWindowMs: 10 * 60_000, global: 120, globalWindowMs: 10 * 60_000 },
  read: { perClient: 30, perClientWindowMs: 60_000, global: 600, globalWindowMs: 60_000 },
} as const;

function take(key: string, limit: number, durationMs: number, now: number) {
  const current = windows.get(key);
  if (!current || now - current.startedAt >= durationMs) {
    windows.set(key, { startedAt: now, count: 1 });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  if (current.count >= limit) {
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((durationMs - (now - current.startedAt)) / 1000)) };
  }
  current.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

function prune(now: number) {
  if (windows.size < MAX_WINDOWS) return;
  for (const [key, window] of windows) {
    if (now - window.startedAt >= 10 * 60_000) windows.delete(key);
  }
  while (windows.size >= MAX_WINDOWS) {
    const oldest = windows.keys().next();
    if (oldest.done) break;
    windows.delete(oldest.value);
  }
}

/** Single-instance fixed-window guard for public SEC lookups and saved-payload reads. */
export function consumeSecCompanyFactsPublicLimit(kind: keyof typeof LIMITS, clientIp: string, now = Date.now()) {
  prune(now);
  const policy = LIMITS[kind];
  const client = take(`${kind}:client:${clientIp || "unknown"}`, policy.perClient, policy.perClientWindowMs, now);
  if (!client.allowed) return client;
  return take(`${kind}:global`, policy.global, policy.globalWindowMs, now);
}

export function resetSecCompanyFactsPublicLimitsForTest() {
  windows.clear();
}
