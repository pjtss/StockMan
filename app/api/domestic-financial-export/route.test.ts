import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CasingCache } from "drizzle-orm/casing";
import { PgDialect } from "drizzle-orm/pg-core";

const { executeMock } = vi.hoisted(() => ({ executeMock: vi.fn() }));
vi.mock("@/lib/db", () => ({ getDb: () => ({ execute: executeMock }) }));

import { GET } from "./route";

describe("GET /api/domestic-financial-export eligibility", () => {
  beforeEach(() => {
    executeMock.mockReset().mockResolvedValue({ rows: [] });
  });

  afterEach(() => vi.unstubAllEnvs());

  it("limits exports to enabled common stocks with fresh KRW market cap above 30 billion won", async () => {
    const response = await GET(new Request("http://localhost/api/domestic-financial-export?format=llm"));
    const body = await response.json();
    const query = executeMock.mock.calls[0][0].toQuery({ dialect: new PgDialect(), casing: new CasingCache() });

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(query.sql).toContain("FROM kr_common_stock_universe u");
    expect(query.sql).toContain("f.market = u.market AND f.code = u.code");
    expect(query.sql).toContain("u.enabled = TRUE");
    expect(query.sql).toContain("u.instrument_type = 'COMMON_STOCK'");
    expect(query.sql).toContain("u.is_etp = FALSE");
    expect(query.sql).toContain("u.is_warrant = FALSE");
    expect(query.sql).toContain("u.is_preferred = FALSE");
    expect(query.sql).toContain("f.currency = 'KRW'");
    expect(query.sql).toContain("f.market_cap > 30000000000");
    expect(query.sql).toContain("f.fetched_at >= NOW() - INTERVAL '24 hours'");
    expect(query.sql).toContain("f.fetched_at <= NOW()");
  });
});
