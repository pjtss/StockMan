import { describe, expect, it, vi } from "vitest";
import { fetchSecOutstandingShares } from "@/lib/sec-outstanding-shares";

describe("SEC outstanding shares fallback", () => {
  it("maps ticker to CIK and reads the latest supported XBRL share tag", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ fields: ["cik", "name", "ticker", "exchange"], data: [[123456, "Example Corp", "EXM", "Nasdaq"]] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ facts: { "us-gaap": { CommonStockSharesOutstanding: { units: { shares: [{ val: 1200000, end: "2026-06-30" }] } } } } }), { status: 200 })));
    await expect(fetchSecOutstandingShares("EXM")).resolves.toMatchObject({ ok: true, source: "SEC", dataType: "OUTSTANDING_SHARES", outstandingShares: 1200000, asOf: "2026-06-30", floatShares: null });
    vi.unstubAllGlobals();
  });
});
