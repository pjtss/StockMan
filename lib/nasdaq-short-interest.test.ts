import { describe, expect, it, vi } from "vitest";
import { fetchNasdaqShortInterest } from "@/lib/nasdaq-short-interest";
describe("Nasdaq short interest fallback", () => {
  it("normalizes rows and calculates days to cover", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { rows: [{ shortInterest: "1,000", averageDailyVolume: "250" }] } }), { status: 200 })));
    await expect(fetchNasdaqShortInterest("AAPL")).resolves.toMatchObject({ ok: true, shortInterest: 1000, daysToCover: 4 });
    vi.unstubAllGlobals();
  });
});
