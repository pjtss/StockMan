import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDb, values, selected, where } = vi.hoisted(() => ({ getDb: vi.fn(), values: vi.fn(), selected: vi.fn(), where: vi.fn() }));
vi.mock("./db", () => ({ getDb }));
vi.mock("./schema", () => ({ kisRealtimeEvents: { market: "market", code: "code", channel: "channel", observedAt: "observedAt" } }));
vi.mock("drizzle-orm", () => ({
  and: (...conditions: unknown[]) => conditions,
  desc: (column: unknown) => ({ direction: "desc", column }),
  eq: (column: unknown, value: unknown) => ({ column, value }),
}));

import { readLatestKisRealtimeEvent, writeKisRealtimeEvent } from "./kis-realtime-event";

describe("writeKisRealtimeEvent", () => {
  beforeEach(() => {
    getDb.mockReset();
    values.mockReset().mockResolvedValue(undefined);
    selected.mockReset();
    where.mockReset();
  });

  it("fails instead of reporting success when the database is unavailable", async () => {
    getDb.mockReturnValue(null);

    await expect(writeKisRealtimeEvent({ market: "KR", code: "005930", channel: "trade", trId: "H0STCNT0", payload: {} }))
      .rejects.toThrow("KIS_REALTIME_EVENT_DATABASE_UNAVAILABLE");
  });

  it("inserts the validated observation into the realtime event table", async () => {
    getDb.mockReturnValue({ insert: vi.fn(() => ({ values })) });
    const event = { market: "US" as const, code: "us:ibm", channel: "trade" as const, trId: "HDFSCNT0", payload: { tr_id: "HDFSCNT0", values: "100^2" }, rawPayload: "frame" };

    await expect(writeKisRealtimeEvent(event)).resolves.toBeUndefined();
    expect(values).toHaveBeenCalledWith(expect.objectContaining({ ...event, code: "IBM", observedAt: expect.any(Date) }));
  });

  it("normalizes a prefixed lowercase US ticker before the latest-event lookup", async () => {
    const row = { market: "US", code: "IBM", channel: "trade" };
    where.mockReturnValue({ orderBy: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([row]) })) });
    getDb.mockReturnValue({ select: vi.fn(() => ({ from: vi.fn(() => ({ where })) })) });

    await expect(readLatestKisRealtimeEvent("US", " us:ibm ", "trade")).resolves.toEqual(row);
    expect(where).toHaveBeenCalledWith([
      { column: "market", value: "US" },
      { column: "code", value: "IBM" },
      { column: "channel", value: "trade" },
    ]);
  });
});
