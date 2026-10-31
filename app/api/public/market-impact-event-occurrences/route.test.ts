import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));
vi.mock("@/lib/db", () => ({ getPool: () => ({ query: queryMock }) }));
import { GET } from "./route";

describe("GET /api/public/market-impact-event-occurrences", () => {
  beforeEach(() => queryMock.mockReset());

  it("filters and returns individual schedule occurrences by their dates", async () => {
    queryMock.mockResolvedValue({ rows: [{ eventId: "event-1", occurrenceDate: "2026-11-02", ordinal: 1, keyDate: { date: "2026-11-02", status: "CONFIRMED_SCHEDULED", description: "실적 발표" } }] });
    const response = await GET(new Request("https://example.test/api/public/market-impact-event-occurrences?from=2026-11-01&to=2026-11-30&market=KR&status=CONFIRMED_SCHEDULED"));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.schemaVersion).toBe("market-impact-event-occurrences.v1");
    expect(body.items[0].occurrenceDate).toBe("2026-11-02");
    expect(queryMock.mock.calls[0][0]).toContain("jsonb_array_elements");
    expect(queryMock.mock.calls[0][1]).toEqual([null, "2026-11-01", "2026-11-30", "KR", null, "CONFIRMED_SCHEDULED", null, 101, null, null, null]);
  });

  it("paginates deterministically when one event has multiple same-day occurrences", async () => {
    const rows = [
      { eventId: "event-1", occurrenceDate: "2026-11-02", ordinal: 1 },
      { eventId: "event-1", occurrenceDate: "2026-11-02", ordinal: 2 },
    ];
    queryMock.mockResolvedValueOnce({ rows }).mockResolvedValueOnce({ rows: [rows[1]] });
    const first = await (await GET(new Request("https://example.test/api/public/market-impact-event-occurrences?limit=1"))).json();
    const second = await (await GET(new Request(`https://example.test/api/public/market-impact-event-occurrences?limit=1&cursor=${encodeURIComponent(first.nextCursor)}`))).json();
    expect(first.items[0].ordinal).toBe(1);
    expect(second.items[0].ordinal).toBe(2);
    expect(second.nextCursor).toBeNull();
    expect(queryMock.mock.calls[1][0]).toContain("ordinal > $11::int");
  });

  it("rejects invalid date ranges and cursor scope changes", async () => {
    const invalid = await GET(new Request("https://example.test/api/public/market-impact-event-occurrences?date=2026-02-30"));
    expect(invalid.status).toBe(400);
    queryMock.mockResolvedValueOnce({ rows: [{ eventId: "event-1", occurrenceDate: "2026-11-02", ordinal: 1 }, { eventId: "event-2", occurrenceDate: "2026-11-01", ordinal: 1 }] });
    const first = await (await GET(new Request("https://example.test/api/public/market-impact-event-occurrences?limit=1&market=KR"))).json();
    const changed = await GET(new Request(`https://example.test/api/public/market-impact-event-occurrences?limit=1&market=US&cursor=${encodeURIComponent(first.nextCursor)}`));
    expect(changed.status).toBe(400);
    expect(queryMock).toHaveBeenCalledTimes(1);
  });
});
