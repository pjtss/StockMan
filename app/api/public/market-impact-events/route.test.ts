import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));

vi.mock("@/lib/db", () => ({ getPool: () => ({ query: queryMock }) }));

import { GET } from "./route";

describe("GET /api/public/market-impact-events", () => {
  beforeEach(() => queryMock.mockReset());

  it("returns an ISO date without converting the SQL DATE to a timestamp", async () => {
    queryMock.mockResolvedValue({ rows: [{ eventId: "DART:1:TEST", eventDate: "2026-10-29", market: "KR", ticker: "034730", eventKey: "DEFAULT", keyDates: [{ date: "2026-11-02", status: "CONFIRMED_SCHEDULED", description: "실적 발표" }], eventDetails: { timezone: "Asia/Seoul" }, publishedAtCursor: null }] });

    const response = await GET(new Request("https://example.test/api/public/market-impact-events?date=2026-10-29"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.items[0].eventDate).toBe("2026-10-29");
    expect(body.items[0].eventKey).toBe("DEFAULT");
    expect(body.items[0].keyDates).toEqual([{ date: "2026-11-02", status: "CONFIRMED_SCHEDULED", description: "실적 발표" }]);
    expect(body.items[0].eventDetails).toEqual({ timezone: "Asia/Seoul" });
    expect(body.nextCursor).toBeNull();
    expect(queryMock.mock.calls[0][0]).toContain("TO_CHAR(event_date, 'YYYY-MM-DD')");
    expect(queryMock.mock.calls[0][0]).toContain('event_key AS "eventKey"');
    expect(queryMock.mock.calls[0][0]).toContain("raw_event -> 'keyDates'");
    expect(queryMock.mock.calls[0][0]).toContain("raw_event -> 'eventDetails'");
  });

  it("rejects invalid market filters before querying the database", async () => {
    const response = await GET(new Request("https://example.test/api/public/market-impact-events?market=CA"));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: "INVALID_QUERY" });
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("filters scheduled events by status and event type", async () => {
    queryMock.mockResolvedValue({ rows: [] });

    const response = await GET(new Request("https://example.test/api/public/market-impact-events?date=2026-10-29&status=estimated&eventType=clinical_trial_readout"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.query).toMatchObject({ status: "ESTIMATED", eventType: "CLINICAL_TRIAL_READOUT" });
    expect(queryMock.mock.calls[0][0]).toContain("AND ($6::text IS NULL OR status = $6)");
    expect(queryMock.mock.calls[0][0]).toContain("AND ($7::text IS NULL OR event_type = $7)");
    expect(queryMock.mock.calls[0][1]).toEqual(["2026-10-29", null, null, null, null, "ESTIMATED", "CLINICAL_TRIAL_READOUT", 101, null, null, null]);
  });

  it("uses a stable cursor to return later pages without changing the sort order", async () => {
    const rows = [
      { eventId: "event-1", eventDate: "2026-10-29", publishedAt: "2026-10-29T12:00:00.000Z", publishedAtCursor: "2026-10-29 12:00:00+00", keyDates: [], eventDetails: {} },
      { eventId: "event-2", eventDate: "2026-10-29", publishedAt: null, publishedAtCursor: null, keyDates: [], eventDetails: {} },
    ];
    queryMock.mockResolvedValueOnce({ rows }).mockResolvedValueOnce({ rows: [rows[1]] });

    const firstResponse = await GET(new Request("https://example.test/api/public/market-impact-events?limit=1"));
    const first = await firstResponse.json();
    expect(first.items.map((item: { eventId: string }) => item.eventId)).toEqual(["event-1"]);
    expect(first.nextCursor).toEqual(expect.any(String));

    const secondResponse = await GET(new Request(`https://example.test/api/public/market-impact-events?limit=1&cursor=${encodeURIComponent(first.nextCursor)}`));
    const second = await secondResponse.json();
    expect(second.items.map((item: { eventId: string }) => item.eventId)).toEqual(["event-2"]);
    expect(second.nextCursor).toBeNull();
    expect(queryMock.mock.calls[1][0]).toContain("event_date < $9::date");
    expect(queryMock.mock.calls[1][1].slice(8)).toEqual(["2026-10-29", "2026-10-29 12:00:00+00", "event-1"]);
  });

  it("rejects malformed cursors before querying the database", async () => {
    const response = await GET(new Request("https://example.test/api/public/market-impact-events?cursor=not-a-cursor"));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: "INVALID_QUERY" });
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("rejects a cursor reused with different filters", async () => {
    queryMock.mockResolvedValueOnce({ rows: [
      { eventId: "event-1", eventDate: "2026-10-29", publishedAtCursor: null },
      { eventId: "event-2", eventDate: "2026-10-28", publishedAtCursor: null },
    ] });
    const firstResponse = await GET(new Request("https://example.test/api/public/market-impact-events?limit=1&status=ESTIMATED"));
    const first = await firstResponse.json();

    const secondResponse = await GET(new Request(`https://example.test/api/public/market-impact-events?limit=1&status=COMPLETED&cursor=${encodeURIComponent(first.nextCursor)}`));

    expect(secondResponse.status).toBe(400);
    expect(await secondResponse.json()).toEqual({ ok: false, error: "INVALID_QUERY" });
    expect(queryMock).toHaveBeenCalledTimes(1);
  });
});
