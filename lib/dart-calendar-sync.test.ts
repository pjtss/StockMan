import { describe, expect, it, vi } from "vitest";
import { syncDartCalendarEvents } from "./dart-calendar-sync";
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), kind: vi.fn(), upsert: vi.fn() }));
vi.mock("./dart-opendart-client", () => ({ fetchOpenDartToday: mocks.fetch }));
vi.mock("./domestic-rss-sources", () => ({ fetchDomesticRss: mocks.kind }));
vi.mock("./investment-calendar", () => ({ upsertInvestmentCalendarEvents: mocks.upsert }));
describe("DART calendar sync", () => {
  it("normalizes earnings and dividend disclosures without duplicating the source id", async () => {
    mocks.fetch.mockResolvedValue({ dateKey: "20260911", rows: [{ rcept_no: "20260911000001", rcept_dt: "20260911", corp_name: "테스트", stock_code: "000001", report_nm: "잠정 실적" }, { rcept_no: "20260911000002", rcept_dt: "20260911", corp_name: "테스트", stock_code: "000001", report_nm: "현금배당결정" }] });
    mocks.kind.mockResolvedValue({ items: [] });
    mocks.upsert.mockResolvedValue(2);
    const result = await syncDartCalendarEvents();
    expect(result.upserted).toBe(2);
    expect(mocks.upsert).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ eventType: "EARNINGS", externalId: "20260911000001", eventDate: "2026-09-11" }), expect.objectContaining({ eventType: "DIVIDEND_PAYMENT", externalId: "20260911000002" })]));
  });
});
