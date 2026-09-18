import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.fn(async () => ({ rows: [] }));

vi.mock("@/lib/db", () => ({
  getPool: () => ({ query }),
}));

describe("intraday detection observability", () => {
  beforeEach(() => query.mockClear());

  it("persists the run and tick with one database round trip", async () => {
    const { recordIntradayTick } = await import("./intraday-detection-observability");
    const observedAt = new Date("2026-09-17T14:00:00.000Z");

    await recordIntradayTick({
      runId: "00000000-0000-0000-0000-000000000001",
      tickId: "00000000-0000-0000-0000-000000000002",
      workerStatus: "RUNNING",
      plannedCount: 10,
      executedCount: 9,
      deferredCount: 1,
      throttledCount: 0,
      failedCount: 0,
      queueDepth: 3,
      observedAt,
      durationMs: 120,
    });

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0]).toContain("WITH run_upsert AS");
    expect(query.mock.calls[0]?.[0]).toContain("INSERT INTO intraday_detection_ticks");
    expect(query.mock.calls[0]?.[1]).toEqual([
      "00000000-0000-0000-0000-000000000001",
      "RUNNING",
      observedAt,
      "00000000-0000-0000-0000-000000000002",
      10,
      9,
      1,
      0,
      0,
      3,
      observedAt,
      120,
    ]);
  });

  it("persists multiple state transitions in one insert", async () => {
    const { recordIntradayTransitions } = await import("./intraday-detection-observability");
    const observedAt = new Date("2026-09-17T14:00:00.000Z");

    await recordIntradayTransitions([
      { tickId: "00000000-0000-0000-0000-000000000001", market: "NAS", code: "AAA", toState: "QUALIFIED", observedAt, dedupeKey: "a" },
      { tickId: "00000000-0000-0000-0000-000000000001", market: "NYS", code: "BBB", fromState: "OBSERVED", toState: "STALE", observedAt, dedupeKey: "b" },
    ]);

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0]).toContain("VALUES ($1,$2,$3,$4,$5,'intraday-v1',$6,$7),($8,$9,$10,$11,$12,'intraday-v1',$13,$14)");
    expect(query.mock.calls[0]?.[1]).toHaveLength(14);
  });

  it("chunks unexpectedly large transition batches", async () => {
    const { recordIntradayTransitions } = await import("./intraday-detection-observability");
    const observedAt = new Date("2026-09-17T14:00:00.000Z");
    const inputs = Array.from({ length: 501 }, (_, index) => ({
      tickId: "00000000-0000-0000-0000-000000000001",
      market: "NAS",
      code: `C${index}`,
      toState: "OBSERVED",
      observedAt,
      dedupeKey: `dedupe-${index}`,
    }));

    await recordIntradayTransitions(inputs);

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0]?.[1]).toHaveLength(3500);
    expect(query.mock.calls[1]?.[1]).toHaveLength(7);
  });
});
