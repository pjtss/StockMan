import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.hoisted(() => vi.fn());
vi.mock("./db", () => ({ getDb: vi.fn(), getPool: () => ({ query }) }));

import { loadPendingSecRssIssuerCandidates, loadPendingSecRssIssuerCiks } from "./sec-edgar-repository";

describe("pending SEC RSS issuer candidates", () => {
  beforeEach(() => query.mockReset().mockResolvedValue({ rows: [{ cik: "0000001234" }, { cik: "invalid" }] }));

  it("uses the official CIK/ticker master and active common-stock universe, not nullable RSS ticker inference", async () => {
    await expect(loadPendingSecRssIssuerCiks(12)).resolves.toEqual(["0000001234"]);
    const [sql, params] = query.mock.calls[0];
    expect(params).toEqual([12]);
    expect(sql).toContain("a.source='SEC_EDGAR'");
    expect(sql).toContain("JOIN sec_companies c ON c.cik=lpad(");
    expect(sql).toContain("unnest(c.tickers)");
    expect(sql).toContain("u.instrument_type='COMMON_STOCK'");
    expect(sql).toContain("NOT EXISTS (SELECT 1 FROM sec_submissions");
    expect(sql).toContain("accession-number=");
    expect(sql).not.toContain("a.detected_ticker IS NOT NULL");
  });

  it.each([[0, 1], [500, 50], [Number.NaN, 10]])("bounds invalid or oversized batch size %s", async (input, expected) => {
    await loadPendingSecRssIssuerCiks(input);
    expect(query.mock.calls[0][1]).toEqual([expected]);
  });

  it("groups the exact unnormalized SEC accessions by issuer and bounds RSS article age", async () => {
    query.mockResolvedValueOnce({ rows: [{ cik: "0000001234", accessions: ["0000001234-26-000001", "invalid"] }] });
    await expect(loadPendingSecRssIssuerCandidates(7)).resolves.toEqual([{ cik: "0000001234", accessions: ["0000001234-26-000001"] }]);
    const [sql, params] = query.mock.calls[0];
    expect(params).toEqual([7]);
    expect(sql).toContain("array_agg(DISTINCT substring(a.external_id");
    expect(sql).toContain("a.published_at >= NOW() - INTERVAL '90 days'");
    expect(sql).toContain("GROUP BY 1 ORDER BY 1 LIMIT $1");
    expect(sql).toContain("u.instrument_type='COMMON_STOCK'");
  });
});
