import { describe, expect, it } from "vitest";
import { validateScreenerRequest } from "@/lib/screener-validation";

describe("screener request validation", () => {
  it("rejects unsupported timeframe and limit", () => {
    expect(validateScreenerRequest({ timeframe: "Q" })).toBe("INVALID_TIMEFRAME");
    expect(validateScreenerRequest({ limit: 0 })).toBe("INVALID_LIMIT");
  });

  it("accepts valid chart conditions", () => {
    expect(validateScreenerRequest({ market: "KR", timeframe: "D", filters: [{ field: "D.rvol", operator: ">=", value: 1 }] })).toBeNull();
  });

  it("rejects malformed ranking and EMA conditions", () => {
    expect(validateScreenerRequest({ ranking: [{ field: "D.rvol", direction: "SIDEWAYS" }] })).toBe("INVALID_RANKING");
    expect(validateScreenerRequest({ ema9Conditions: { Q: "ABOVE" } })).toBe("INVALID_EMA9_CONDITIONS");
    expect(validateScreenerRequest({ emaPositionConditions: { EMA20: "ABOVE" } })).toBeNull();
    expect(validateScreenerRequest({ filters: [{ field: "D.internal", operator: "=", value: true }] })).toBe("INVALID_FILTERS");
  });

  it("validates the optional as-of date", () => {
    expect(validateScreenerRequest({ asOf: "2026-09-01" })).toBeNull();
    expect(validateScreenerRequest({ asOf: "yesterday" })).toBe("INVALID_AS_OF");
    expect(validateScreenerRequest({ asOf: "2026-02-30" })).toBe("INVALID_AS_OF");
  });

  it("rejects non-finite numeric filter values", () => {
    expect(validateScreenerRequest({ filters: [{ field: "D.rvol", operator: ">=", value: "high" }] })).toBe("INVALID_FILTERS");
    expect(validateScreenerRequest({ filters: [{ field: "D.close", operator: ">=", value: -1 }] })).toBe("INVALID_FILTERS");
    expect(validateScreenerRequest({ filters: [{ field: "D.close", operator: "<=", value: "D.bb.middle" }] })).toBeNull();
    expect(validateScreenerRequest({ filters: [{ field: "D.close", operator: "<=", value: "close" }] })).toBe("INVALID_FILTERS");
  });
});
