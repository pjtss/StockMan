import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getPool: vi.fn(), connect: vi.fn(), query: vi.fn(), release: vi.fn() }));
vi.mock("./db", () => ({ getPool: mocks.getPool }));

import { materializeStockmanSecEvents } from "./stockman-events";

describe("SEC event materializer accession bounds", () => {
  beforeEach(() => {
    mocks.query.mockReset().mockResolvedValue({ rows: [] });
    mocks.release.mockReset();
    mocks.connect.mockReset().mockResolvedValue({ query: mocks.query, release: mocks.release });
    mocks.getPool.mockReturnValue({ connect: mocks.connect });
  });

  it("uses an indexable exact accession array for RSS candidates", async () => {
    await materializeStockmanSecEvents(500, undefined, ["0000000001-26-000001", "0000000002-26-000002"]);
    const [sql, params] = mocks.query.mock.calls.find(([query]) => String(query).includes("FROM sec_submissions s"));
    expect(sql).toContain("s.accession = ANY($3::text[])");
    expect(params).toEqual([500, expect.any(Array), ["0000000001-26-000001", "0000000002-26-000002"]]);
    expect(mocks.query).toHaveBeenCalledWith("SELECT set_config('application_name', 'stockman-sec-event-materializer', true)");
    expect(mocks.query).toHaveBeenCalledWith("SELECT set_config('statement_timeout', '300000ms', true)");
    expect(mocks.query).toHaveBeenCalledWith("SELECT set_config('idle_in_transaction_session_timeout', '60000ms', true)");
    expect(mocks.release).toHaveBeenCalledOnce();
  });

  it("bounds and prioritizes the full materializer path when no accession filter is supplied", async () => {
    await materializeStockmanSecEvents();
    const [sql, params] = mocks.query.mock.calls.find(([query]) => String(query).includes("FROM sec_submissions s"));
    expect(sql).not.toContain("s.accession = ANY");
    expect(sql).toContain("ORDER BY s.acceptance_datetime DESC NULLS LAST,s.accession LIMIT $1");
    expect(params).toEqual([500, expect.any(Array)]);
  });

  it("preserves the single-accession public materializer filter", async () => {
    await materializeStockmanSecEvents(1, "0000000003-26-000003");
    const [sql, params] = mocks.query.mock.calls.find(([query]) => String(query).includes("FROM sec_submissions s"));
    expect(sql).toContain("s.accession = ANY($3::text[])");
    expect(params).toEqual([1, expect.any(Array), ["0000000003-26-000003"]]);
  });
});
