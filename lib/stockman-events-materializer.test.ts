import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getPool: vi.fn(), query: vi.fn() }));
vi.mock("./db", () => ({ getPool: mocks.getPool }));

import { materializeStockmanSecEvents } from "./stockman-events";

describe("SEC event materializer accession bounds", () => {
  beforeEach(() => {
    mocks.query.mockReset().mockResolvedValue({ rows: [] });
    mocks.getPool.mockReturnValue({ query: mocks.query });
  });

  it("uses an indexable exact accession array for RSS candidates", async () => {
    await materializeStockmanSecEvents(500, undefined, ["0000000001-26-000001", "0000000002-26-000002"]);
    const [sql, params] = mocks.query.mock.calls[0];
    expect(sql).toContain("s.accession = ANY($3::text[])");
    expect(params).toEqual([500, expect.any(Array), ["0000000001-26-000001", "0000000002-26-000002"]]);
  });

  it("keeps the full materializer path unbounded when no filter is supplied", async () => {
    await materializeStockmanSecEvents();
    const [sql, params] = mocks.query.mock.calls[0];
    expect(sql).not.toContain("s.accession = ANY");
    expect(params).toEqual([500, expect.any(Array)]);
  });

  it("preserves the single-accession public materializer filter", async () => {
    await materializeStockmanSecEvents(1, "0000000003-26-000003");
    const [sql, params] = mocks.query.mock.calls[0];
    expect(sql).toContain("s.accession = ANY($3::text[])");
    expect(params).toEqual([1, expect.any(Array), ["0000000003-26-000003"]]);
  });
});
