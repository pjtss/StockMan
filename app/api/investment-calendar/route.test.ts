import { beforeEach, describe, expect, it, vi } from "vitest";

const listEvents = vi.hoisted(() => vi.fn());
vi.mock("@/lib/investment-calendar", () => ({
  CALENDAR_EVENT_TYPES: ["IPO", "EARNINGS"],
  listInvestmentCalendarEvents: listEvents,
  upsertInvestmentCalendarEvents: vi.fn(),
}));

import { GET } from "./route";

describe("investment calendar API date validation", () => {
  beforeEach(() => listEvents.mockReset().mockResolvedValue([]));

  it.each(["2026-02-29", "2026-04-31", "2026-13-01"])("rejects impossible date %s before querying", async (date) => {
    const response = await GET(new Request(`http://localhost/api/investment-calendar?from=${date}`));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false, error: "INVALID_DATE_RANGE" });
    expect(listEvents).not.toHaveBeenCalled();
  });

  it("accepts a valid Gregorian leap day", async () => {
    const response = await GET(new Request("http://localhost/api/investment-calendar?from=2024-02-29&to=2024-03-01"));
    expect(response.status).toBe(200);
    expect(listEvents).toHaveBeenCalledWith(expect.objectContaining({ from: "2024-02-29", to: "2024-03-01" }));
  });
});
