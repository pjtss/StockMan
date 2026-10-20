export const DEFAULT_429_COOLDOWN_MS = 30_000;
export const MAX_429_COOLDOWN_MS = 15 * 60_000;

export function rateLimitCooldownMs(status, retryAfter, nowMs = Date.now()) {
  if (status !== 429) return 0;
  const header = String(retryAfter ?? "").trim();
  let delayMs = DEFAULT_429_COOLDOWN_MS;
  if (/^\d+(?:\.\d+)?$/.test(header)) delayMs = Number(header) * 1000;
  else if (header) {
    const retryAt = Date.parse(header);
    if (Number.isFinite(retryAt)) delayMs = Math.max(0, retryAt - nowMs);
  }
  if (!Number.isFinite(delayMs)) return DEFAULT_429_COOLDOWN_MS;
  return Math.min(Math.max(0, delayMs), MAX_429_COOLDOWN_MS);
}
