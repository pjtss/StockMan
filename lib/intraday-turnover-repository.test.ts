import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.fn(async () => ({ rows: [] }));

vi.mock("@/lib/db", () => ({ getPool: () => ({ query }) }));

describe("intraday turnover persistence", () => {
  beforeEach(() => query.mockClear());

  it("writes KIS source and derived minute turnover idempotently by instrument/session/minute", async () => {
    const { saveIntradayTurnoverObservations } = await import("./intraday-turnover-repository");
    const observedAt = new Date("2026-09-25T05:01:10.000Z");
    const bucketAt = new Date("2026-09-25T05:01:00.000Z");

    await expect(saveIntradayTurnoverObservations([{
      market: "NAS", code: "TEST", sessionDate: "2026-09-25", observedAt, bucketAt,
      currency: "USD", price: 12.5, volume: 800, sourceTradingValue: 10_000,
      minuteTradingValue: 1_250, minuteTradingValueSource: "KIS_CUMULATIVE_DELTA", marketCap: 2_000_000,
      rollingTradingValue: 6_000, turnoverRatio: 0.003, sourcePayload: { last: "12.5", tamnt: "10000" },
    }])).resolves.toBe(1);

    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0]?.[0]).toContain("INSERT INTO intraday_turnover_observations");
    expect(query.mock.calls[0]?.[0]).toContain("ON CONFLICT (market,code,session_date,bucket_at) DO UPDATE");
    expect(query.mock.calls[0]?.[1]).toEqual([
      "NAS", "TEST", "2026-09-25", bucketAt, observedAt, "USD", 12.5, 800,
      10_000, 1_250, "KIS_CUMULATIVE_DELTA", 2_000_000, 6_000, 0.003,
      JSON.stringify({ last: "12.5", tamnt: "10000" }),
    ]);
  });

  it("does not issue a DB query for an empty batch", async () => {
    const { saveIntradayTurnoverObservations } = await import("./intraday-turnover-repository");
    await expect(saveIntradayTurnoverObservations([])).resolves.toBe(0);
    expect(query).not.toHaveBeenCalled();
  });

  it("chunks a full 300-candidate tick below PostgreSQL bind-parameter limits", async () => {
    const { saveIntradayTurnoverObservations } = await import("./intraday-turnover-repository");
    const observedAt = new Date("2026-09-25T05:01:10.000Z");
    const bucketAt = new Date("2026-09-25T05:01:00.000Z");
    const observations = Array.from({ length: 300 }, (_, index) => ({
      market: "NAS", code: `T${index}`, sessionDate: "2026-09-25", observedAt, bucketAt,
      currency: "USD" as const, price: 10, volume: 1, sourceTradingValue: 10,
      minuteTradingValue: 10, minuteTradingValueSource: "PRICE_VOLUME_FALLBACK" as const,
      marketCap: 1000, rollingTradingValue: 10,
      turnoverRatio: 0.01, sourcePayload: { last: "10" },
    }));

    await expect(saveIntradayTurnoverObservations(observations)).resolves.toBe(300);

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0]?.[1]).toHaveLength(250 * 15);
    expect(query.mock.calls[0]?.[0]).toContain("$3750::jsonb");
    expect(query.mock.calls[1]?.[1]).toHaveLength(50 * 15);
    expect(query.mock.calls[1]?.[0]).toContain("$750::jsonb");
  });

  it("propagates persistence failures so the worker can mark its tick degraded", async () => {
    query.mockRejectedValueOnce(new Error("local DB unavailable"));
    const { saveIntradayTurnoverObservations } = await import("./intraday-turnover-repository");
    const observation = {
      market: "KOSPI", code: "005930", sessionDate: "2026-09-25",
      observedAt: new Date("2026-09-25T01:00:00.000Z"), bucketAt: new Date("2026-09-25T01:00:00.000Z"),
      currency: "KRW" as const, price: 70000, volume: 10, sourceTradingValue: 700000,
      minuteTradingValue: 700000, minuteTradingValueSource: "PRICE_VOLUME_FALLBACK" as const,
      marketCap: 1000000000, rollingTradingValue: 700000,
      turnoverRatio: 0.0007, sourcePayload: {},
    };

    await expect(saveIntradayTurnoverObservations([observation])).rejects.toThrow("local DB unavailable");
  });
});
