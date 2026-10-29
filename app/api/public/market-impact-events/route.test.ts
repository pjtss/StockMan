import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));

vi.mock("@/lib/db", () => ({ getPool: () => ({ query: queryMock }) }));

import { GET } from "./route";

describe("GET /api/public/market-impact-events", () => {
  beforeEach(() => queryMock.mockReset());

  it("returns an ISO date without converting the SQL DATE to a timestamp", async () => {
    queryMock.mockResolvedValue({ rows: [{ eventId: "DART:1:TEST", eventDate: "2026-10-29", market: "KR", ticker: "034730" }] });

    const response = await GET(new Request("https://example.test/api/public/market-impact-events?date=2026-10-29"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.items[0].eventDate).toBe("2026-10-29");
    expect(queryMock.mock.calls[0][0]).toContain("TO_CHAR(event_date, 'YYYY-MM-DD')");
  });

  it("rejects invalid market filters before querying the database", async () => {
    const response = await GET(new Request("https://example.test/api/public/market-impact-events?market=CA"));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: "INVALID_QUERY" });
    expect(queryMock).not.toHaveBeenCalled();
  });
});
