import { describe, expect, it } from "vitest";
import { classifyUsTurnoverSnapshotState } from "./us-turnover-snapshot-state";

describe("US turnover snapshot state", () => {
  it("distinguishes new, continuing and recovered symbols", () => {
    expect(classifyUsTurnoverSnapshotState({ hasCurrentSessionSnapshot: false, hadPreviousSessionSnapshot: false, hasComparisonSnapshot: true })).toBe("NEW");
    expect(classifyUsTurnoverSnapshotState({ hasCurrentSessionSnapshot: true, hadPreviousSessionSnapshot: true, hasComparisonSnapshot: true })).toBe("CONTINUING");
    expect(classifyUsTurnoverSnapshotState({ hasCurrentSessionSnapshot: false, hadPreviousSessionSnapshot: true, hasComparisonSnapshot: true })).toBe("RECOVERED");
  });

  it("prioritizes insufficient comparison data and stale data", () => {
    expect(classifyUsTurnoverSnapshotState({ hasCurrentSessionSnapshot: false, hadPreviousSessionSnapshot: false, hasComparisonSnapshot: false })).toBe("INSUFFICIENT");
    const now = new Date("2026-01-01T00:10:00Z");
    expect(classifyUsTurnoverSnapshotState({ hasCurrentSessionSnapshot: true, hadPreviousSessionSnapshot: true, hasComparisonSnapshot: true, lastObservedAt: new Date("2026-01-01T00:00:00Z"), now, staleAfterSeconds: 60 })).toBe("STALE");
  });
});
