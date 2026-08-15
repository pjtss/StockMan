import { describe, expect, it, vi } from "vitest";
import { fetchSecFreeFloat } from "@/lib/sec-free-float";

describe("SEC explicit free float extraction", () => {
  it("extracts only an explicitly disclosed non-affiliate share count", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ fields: ["cik", "name", "ticker", "exchange"], data: [[123456, "Example Corp", "EXM", "Nasdaq"]] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ filings: { recent: { form: ["10-K"], filingDate: ["2026-06-30"], accessionNumber: ["0000123456-26-000001"], primaryDocument: ["example10k.htm"] } } }), { status: 200 }))
      .mockResolvedValueOnce(new Response("<html>Shares held by non-affiliates: 987,654 shares</html>", { status: 200 })));
    await expect(fetchSecFreeFloat("EXM", "NAS")).resolves.toMatchObject({ ok: true, source: "SEC", dataType: "FREE_FLOAT", floatShares: 987654, asOf: "2026-06-30" });
    vi.unstubAllGlobals();
  });
});
