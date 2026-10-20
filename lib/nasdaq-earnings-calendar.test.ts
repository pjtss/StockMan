import { describe, expect, it } from "vitest";
import { fetchNasdaqEarningsCalendar } from "./nasdaq-earnings-calendar";

describe("Nasdaq earnings calendar", () => {
  it("normalizes announced earnings rows and preserves an estimated-source warning", async () => {
    const result = await fetchNasdaqEarningsCalendar("2026-09-26", "2026-10-10", async () => new Response(JSON.stringify({ data: { rows: [{ symbol: "ABCD", name: "Example Bio", announceDate: "10/01/2026", fiscalQuarterEnding: "09/30/2026", time: "time-after-hours" }] } }), { status: 200 }));
    expect(result).toEqual([expect.objectContaining({ code: "ABCD", eventType: "EARNINGS", eventDate: "2026-10-01", source: "NASDAQ_EARNINGS_CALENDAR" })]);
    expect(result[0]?.description).toContain("회사 IR 확인 필요");
  });

  it("ignores rows without a symbol or valid date", async () => {
    const result = await fetchNasdaqEarningsCalendar("2026-09-26", "2026-10-10", async () => new Response(JSON.stringify({ data: { rows: [{ name: "No ticker", announceDate: "TBD" }] } }), { status: 200 }));
    expect(result).toEqual([]);
  });
});
