import { describe, expect, it } from "vitest";
import { getBackfillRunError, mergeBackfillPage, parseBoundedIntegerSetting } from "./daily-cache-backfill-control.mjs";

describe("US daily backfill controls", () => {
  it("uses defaults, clamps bounds, and rejects non-integer configuration", () => {
    expect(parseBoundedIntegerSetting("TARGET", undefined, 1200, 1, 1200)).toBe(1200);
    expect(parseBoundedIntegerSetting("TARGET", "1400", 1200, 1, 1200)).toBe(1200);
    expect(parseBoundedIntegerSetting("WORKERS", "0", 4, 1, 4)).toBe(1);
    expect(() => parseBoundedIntegerSetting("TARGET", "oops", 1200, 1, 1200)).toThrow("INVALID_INTEGER_SETTING:TARGET");
    expect(() => parseBoundedIntegerSetting("TARGET", "1.5", 1200, 1, 1200)).toThrow("INVALID_INTEGER_SETTING:TARGET");
  });

  it("detects repeated provider pages while allowing older dates to extend history", () => {
    const rows = new Map();
    expect(mergeBackfillPage(rows, [{ date: "20261027" }, { date: "20261026" }])).toBe(2);
    expect(mergeBackfillPage(rows, [{ date: "20261027" }, { date: "20261026" }])).toBe(0);
    expect(mergeBackfillPage(rows, [{ date: "20261025" }])).toBe(1);
    expect(rows.size).toBe(3);
  });

  it("returns a failing completion status for empty universes and partial failures", () => {
    expect(getBackfillRunError(0, 0)).toBe("US_DAILY_BACKFILL_EMPTY_UNIVERSE");
    expect(getBackfillRunError(20, 2)).toBe("US_DAILY_BACKFILL_PARTIAL_FAILURES:2/20");
    expect(getBackfillRunError(20, 0)).toBeNull();
  });
});
