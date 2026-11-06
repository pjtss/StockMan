import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getPool: vi.fn(), query: vi.fn() }));
vi.mock("./db", () => ({ getPool: mocks.getPool }));

import { loadPendingSecRssIssuerCandidates } from "./sec-edgar-repository";

describe("pending SEC RSS candidate batching", () => {
  beforeEach(() => {
    mocks.query.mockReset().mockResolvedValue({ rows: [{ cik: "0000000001", accessions: ["0000000001-26-000001"] }] });
    mocks.getPool.mockReturnValue({ query: mocks.query });
  });

  it("limits each issuer to its latest pending accession window", async () => {
    await expect(loadPendingSecRssIssuerCandidates()).resolves.toEqual([
      { cik: "0000000001", accessions: ["0000000001-26-000001"] },
    ]);
    const [sql, params] = mocks.query.mock.calls[0];
    expect(sql).toContain("max(a.published_at) AS published_at");
    expect(sql).toContain("ROW_NUMBER() OVER (PARTITION BY cik ORDER BY published_at DESC,accession DESC)");
    expect(sql).toContain("WHERE accession_rank <= $2");
    expect(params).toEqual([5, 10]);
  });

  it("clamps both candidate limits", async () => {
    await loadPendingSecRssIssuerCandidates(100, 0);
    expect(mocks.query.mock.calls[0][1]).toEqual([50, 1]);
  });
});
