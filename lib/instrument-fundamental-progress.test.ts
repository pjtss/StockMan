import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { fundamentalRefreshScopeHash, markFundamentalBatchInTransaction } from "./instrument-fundamental-progress";

describe("instrument fundamental durable progress", () => {
  it("builds an order-independent identity from market and code, excluding display names", () => {
    const original = [{ market: "NAS", code: "AAPL", name: "Apple" }, { market: "KOSPI", code: "005930", name: "Samsung" }];
    expect(fundamentalRefreshScopeHash(original)).toBe(fundamentalRefreshScopeHash([...original].reverse()));
    expect(fundamentalRefreshScopeHash(original)).toBe(fundamentalRefreshScopeHash(original.map((item) => ({ ...item, name: `${item.name} renamed` }))));
    expect(fundamentalRefreshScopeHash(original)).not.toBe(fundamentalRefreshScopeHash([...original, { market: "NYS", code: "NEW", name: "New" }]));
  });

  it("updates successful and failed item markers separately with parameterized SQL", async () => {
    const queries: ReturnType<PgDialect["sqlToQuery"]>[] = [];
    const tx = { execute: vi.fn(async (query: Parameters<PgDialect["sqlToQuery"]>[0]) => {
      const compiled = new PgDialect().sqlToQuery(query);
      queries.push(compiled);
      return { rowCount: 1 };
    }) };

    await markFundamentalBatchInTransaction(tx, 42, [{ market: "NAS", code: "AAPL", name: "Apple" }], [{ market: "NAS", code: "MSFT", name: "Microsoft", errorCode: "KIS_TIMEOUT" }]);

    expect(tx.execute).toHaveBeenCalledTimes(2);
    expect(queries[0].sql).toMatch(/UPDATE instrument_fundamental_refresh_items/i);
    expect(queries[0].sql).toMatch(/FROM \(VALUES/i);
    expect(queries[0].params).toContain("SUCCESS");
    expect(queries[0].params).toContain("AAPL");
    expect(queries[1].params).toContain("FAILED");
    expect(queries[1].params).toContain("KIS_TIMEOUT");
    expect(queries[1].params).toContain(42);
  });

  it("rejects a progress update that did not affect every expected row", async () => {
    const tx = { execute: vi.fn(async () => ({ rowCount: 0 })) };
    await expect(markFundamentalBatchInTransaction(tx, 1, [{ market: "NAS", code: "AAPL", name: "Apple" }], []))
      .rejects.toThrow("FUNDAMENTAL_REFRESH_PROGRESS_ROW_COUNT_MISMATCH");
  });
});
