import { describe, expect, it } from "vitest";
import { DEFAULT_429_COOLDOWN_MS, MAX_429_COOLDOWN_MS, rateLimitCooldownMs } from "./retry-policy.mjs";

describe("RSS per-source HTTP 429 retry policy", () => {
  it("does not add cooldown to non-rate-limit statuses", () => {
    expect(rateLimitCooldownMs(503, "120")).toBe(0);
  });
  it("uses Retry-After seconds and caps unexpectedly long values", () => {
    expect(rateLimitCooldownMs(429, "17")).toBe(17_000);
    expect(rateLimitCooldownMs(429, "99999")).toBe(MAX_429_COOLDOWN_MS);
  });
  it("parses Retry-After HTTP dates against the injected clock", () => {
    const now = Date.parse("2026-09-27T00:00:00Z");
    expect(rateLimitCooldownMs(429, "Sun, 27 Sep 2026 00:00:12 GMT", now)).toBe(12_000);
    expect(rateLimitCooldownMs(429, "Sat, 26 Sep 2026 23:59:00 GMT", now)).toBe(0);
  });
  it("uses a bounded fallback when Retry-After is absent or malformed", () => {
    expect(rateLimitCooldownMs(429, null)).toBe(DEFAULT_429_COOLDOWN_MS);
    expect(rateLimitCooldownMs(429, "not-a-date")).toBe(DEFAULT_429_COOLDOWN_MS);
  });
});
