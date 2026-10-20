export const DEFAULT_429_COOLDOWN_MS: number;
export const MAX_429_COOLDOWN_MS: number;
export function rateLimitCooldownMs(status: number, retryAfter: string | null | undefined, nowMs?: number): number;
