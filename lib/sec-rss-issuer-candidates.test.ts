import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.hoisted(() => vi.fn());
vi.mock("./db", () => ({ getDb: vi.fn(), getPool: () => ({ query }) }));

import { loadPendingSecRssIssuerCiks } from "./sec-edgar-repository";

describe("pending SEC RSS issuer candidates", () => {
  beforeEach(() => query.mockReset().mockResolvedValue({ rows: [{ cik: "0000001234" }, { cik: "invalid" }] }));

  it("only returns normalized CIKs and queries a bounded active common-stock accession set", async () => {
    await expect(loadPendingSecRssIssuerCiks(12)).resolves.toEqual(["0000001234"]);
    const [sql, params] = query.mock.calls[0];
    expect(params).toEqual([12]);
    expect(sql).toContain("a.source='SEC_EDGAR'");
    expect(sql).toContain("u.instrument_type='COMMON_STOCK'");
    expect(sql).toContain("NOT EXISTS (SELECT 1 FROM sec_submissions");
    expect(sql).toContain("accession-number=");
  });

  it.each([[0, 1], [500, 50], [Number.NaN, 10]])("bounds invalid or oversized batch size %s", async (input, expected) => {
    await loadPendingSecRssIssuerCiks(input);
    expect(query.mock.calls[0][1]).toEqual([expected]);
  });
});
