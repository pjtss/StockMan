import { describe, expect, it } from "vitest";
import { GET } from "./route";
import { intradayMemoryState } from "@/lib/intraday-memory-state";

describe("intraday MVP result API", () => {
  it("returns only qualified TOP100 candidates with criteria metadata", async () => {
    intradayMemoryState.upsertCandidate({ market: "NAS", code: "MVP", priority: 100, lastSeenAt: 1, lastCheckedAt: 0, nextCheckAt: 1, consecutiveFailures: 0, marketCap: 1_000, mvpTracking: true, focusTracking: true });
    intradayMemoryState.rotateSnapshot([{ market: "NAS", code: "MVP", name: "MVP Corp", rank: 1 }]);
    for (let index = 0; index < 5; index += 1) intradayMemoryState.recordRollingTurnover("NAS", "MVP", "2026-09-13", index * 60_000, 10, 1_000);
    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.criteria).toMatchObject({ windowMinutes: 5, requiredSamples: 5, minTurnoverToMarketCapRatio: 0.05, marketCapSource: "KIS_FIXED" });
    expect(body.status.reason).toBe("QUALIFIED");
    expect(body.items).toEqual([expect.objectContaining({ market: "NAS", code: "MVP", sampleCount: 5, rollingTurnoverRatio: 0.05 })]);
    expect(body.criteria).toMatchObject({ retainedTurnoverMinutes: 10, retentionSource: "PROCESS_MEMORY" });
    expect(body.usFocusItems).toEqual([expect.objectContaining({ market: "NAS", code: "MVP", name: "MVP Corp", currency: "USD", turnoverWindows: expect.arrayContaining([expect.objectContaining({ minutes: 1, complete: true }), expect.objectContaining({ minutes: 5, tradingValue: 50, complete: true }), expect.objectContaining({ minutes: 10, tradingValue: null, complete: false })]) })]);
    intradayMemoryState.removeCandidate("NAS", "MVP");
  });

  it("does not expose a qualified candidate after it leaves the current TOP100 snapshot", async () => {
    intradayMemoryState.upsertCandidate({ market: "NAS", code: "STALE", priority: 100, lastSeenAt: 1, lastCheckedAt: 0, nextCheckAt: 1, consecutiveFailures: 0, marketCap: 1_000, mvpTracking: true, mvpQualified: true });
    intradayMemoryState.rotateSnapshot([{ market: "NAS", code: "OTHER" }]);
    const body = await (await GET()).json();
    expect(body.items).toEqual([]);
    expect(body.status.reason).toBe("NO_TOP100");
    intradayMemoryState.removeCandidate("NAS", "STALE");
  });
});
