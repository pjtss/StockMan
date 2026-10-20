import { describe, expect, it } from "vitest";
import { getMarketRssCronStatus } from "./market-rss-cron-status";

describe("market RSS cron outcome", () => {
  it("keeps a clean ingest and translation run successful", () => {
    expect(getMarketRssCronStatus(0, { fallback: 0, failed: 0 })).toEqual({
      degraded: false,
      counterDataInvalid: false,
      partialFailureCount: 0,
      ingestFailureCount: 0,
      translationFailureCount: 0,
    });
  });

  it("marks translation fallbacks and failures as partial instead of a green run", () => {
    expect(getMarketRssCronStatus(0, { fallback: 2, failed: 1 })).toEqual({
      degraded: true,
      counterDataInvalid: false,
      partialFailureCount: 3,
      ingestFailureCount: 0,
      translationFailureCount: 3,
    });
  });

  it("adds ingest and translation issues while exposing each stage count", () => {
    expect(getMarketRssCronStatus(2, { fallback: 1, failed: 0 })).toEqual({
      degraded: true,
      counterDataInvalid: false,
      partialFailureCount: 3,
      ingestFailureCount: 2,
      translationFailureCount: 1,
    });
  });

  it("treats invalid negative counters as zero", () => {
    expect(getMarketRssCronStatus(-3, { fallback: -1, failed: -2 }).partialFailureCount).toBe(0);
  });

  it("treats NaN and infinite stage counters as invalid instead of silently poisoning status", () => {
    expect(getMarketRssCronStatus(Number.NaN, { fallback: Number.POSITIVE_INFINITY, failed: Number.NaN })).toEqual({
      degraded: true,
      counterDataInvalid: true,
      partialFailureCount: 0,
      ingestFailureCount: 0,
      translationFailureCount: 0,
    });
    expect(getMarketRssCronStatus(1, { fallback: Number.NaN, failed: Number.NEGATIVE_INFINITY })).toMatchObject({
      degraded: true,
      counterDataInvalid: true,
      partialFailureCount: 1,
      ingestFailureCount: 1,
      translationFailureCount: 0,
    });
  });

  it("does not mark an omitted optional translation counter invalid", () => {
    expect(getMarketRssCronStatus(0, {})).toMatchObject({ degraded: false, counterDataInvalid: false, partialFailureCount: 0 });
  });

  it("validates that localized reason counts reconcile with fallback plus failed totals", () => {
    expect(getMarketRssCronStatus(1, {
      fallback: 2,
      failed: 1,
      fallbackReasons: { translation_output_incomplete: 2, translation_api_error: 1 },
    })).toMatchObject({ counterDataInvalid: false, ingestFailureCount: 1, translationFailureCount: 3, partialFailureCount: 4 });

    expect(getMarketRssCronStatus(0, {
      fallback: 2,
      failed: 1,
      fallbackReasons: { translation_output_incomplete: 2 },
    })).toMatchObject({ degraded: true, counterDataInvalid: true, translationFailureCount: 3, partialFailureCount: 3 });
  });
});
