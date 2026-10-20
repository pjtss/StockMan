import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const dbState = vi.hoisted(() => ({ connect: vi.fn() }));
vi.mock("@/lib/db", () => ({ getPool: () => ({ connect: dbState.connect }) }));

import { beginFundamentalRefresh, fundamentalRefreshScopeHash, markFundamentalBatchInTransaction } from "./instrument-fundamental-progress";

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
    expect(queries[0].sql).toMatch(/next_attempt_at/i);
    expect(queries[0].sql).toMatch(/last_attempt_at\s*=\s*NOW\(\)/i);
    expect(queries[1].params).toContain("FAILED");
    expect(queries[1].params).toContain("KIS_TIMEOUT");
    expect(queries[1].params).toContain(42);
    expect(queries[1].sql).toMatch(/INTERVAL '24 hours'/i);
  });

  it("does not rewrite item timestamps when resuming unchanged retry names", async () => {
    const clientQuery = vi.fn(async (query: unknown) => {
      const text = String(query);
      if (text.includes("SELECT id FROM instrument_fundamental_refresh_jobs")) return { rows: [{ id: "42" }] };
      if (text.includes("SELECT market, code, name")) return { rows: [] };
      if (text.includes("status = 'SUCCESS'")) return { rows: [{ count: "6558" }] };
      if (text.includes("next_attempt_at > NOW()")) return { rows: [{ count: "146", next_retry_at: "2026-10-20T10:05:00Z" }] };
      return { rows: [] };
    });
    dbState.connect.mockResolvedValueOnce({ query: clientQuery, release: vi.fn() });

    const result = await beginFundamentalRefresh([
      { market: "NAS", code: "AAPL", name: "Apple" },
    ]);

    expect(result).toMatchObject({ resumed: true, instruments: [], skippedCompletedCount: 6558, deferredRetryCount: 146 });
    const nameSyncSql = String(clientQuery.mock.calls[4][0]);
    expect(nameSyncSql).toContain("item.name IS DISTINCT FROM source.name");
    expect(nameSyncSql).not.toContain("updated_at = NOW()");
  });

  it("selects failed instruments for provider retry once their persisted backoff expires", async () => {
    const due = { market: "NAS", code: "RETRY", name: "Retry Corp" };
    const clientQuery = vi.fn(async (query: unknown) => {
      const text = String(query);
      if (text.includes("SELECT id FROM instrument_fundamental_refresh_jobs")) return { rows: [{ id: "42" }] };
      if (text.includes("SELECT market, code, name")) return { rows: [due] };
      if (text.includes("SELECT COUNT(*)::text AS count FROM instrument_fundamental_refresh_items WHERE job_id = $1 AND status = 'SUCCESS'")) return { rows: [{ count: "6558" }] };
      if (text.includes("next_attempt_at > NOW()")) return { rows: [{ count: "145", next_retry_at: "2026-10-20T10:05:00Z" }] };
      return { rows: [] };
    });
    dbState.connect.mockResolvedValueOnce({ query: clientQuery, release: vi.fn() });

    const result = await beginFundamentalRefresh([
      { market: "NAS", code: "RETRY", name: "Retry Corp" },
    ]);

    expect(result.instruments).toEqual([due]);
    expect(result.deferredRetryCount).toBe(145);
    const pendingQuery = clientQuery.mock.calls.find(([query]) => String(query).includes("SELECT market, code, name"));
    expect(String(pendingQuery?.[0])).toMatch(/status = 'FAILED'[\s\S]*next_attempt_at <= NOW\(\)/i);
    expect(pendingQuery?.[1]).toEqual([42]);
  });

  it("rejects a progress update that did not affect every expected row", async () => {
    const tx = { execute: vi.fn(async () => ({ rowCount: 0 })) };
    await expect(markFundamentalBatchInTransaction(tx, 1, [{ market: "NAS", code: "AAPL", name: "Apple" }], []))
      .rejects.toThrow("FUNDAMENTAL_REFRESH_PROGRESS_ROW_COUNT_MISMATCH");
  });
});
