import { describe, expect, it } from "vitest";
import { getSmokeDeadlineMs } from "./smoke-retry-policy.mjs";

describe("deployment smoke retry deadline", () => {
  it("leaves at least one full retry window when a single response reaches its timeout", () => {
    expect(getSmokeDeadlineMs(30_000, 30_000)).toBe(61_000);
  });

  it("preserves a longer configured deadline", () => {
    expect(getSmokeDeadlineMs(90_000, 30_000)).toBe(90_000);
  });

  it("uses defaults for invalid timeout values", () => {
    expect(getSmokeDeadlineMs(Number.NaN, 0)).toBe(31_000);
  });
});
