import { beforeEach, describe, expect, it, vi } from "vitest";

const listEvents = vi.hoisted(() => vi.fn());
vi.mock("@/lib/investment-calendar", () => ({ listInvestmentCalendarEvents: listEvents }));

import { GET } from "./route";

describe("listings API", () => {
  beforeEach(() => listEvents.mockReset().mockResolvedValue([]));

  it("truncates fractional limit before querying", async () => {
    const response = await GET(new Request("http://localhost/api/listings?limit=2.8"));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.count).toBe(0);
    expect(listEvents).toHaveBeenCalledWith(expect.objectContaining({ limit: 2 }));
  });

  it("clamps limit to the supported range and defaults invalid values", async () => {
    await GET(new Request("http://localhost/api/listings?limit=9999"));
    expect(listEvents).toHaveBeenLastCalledWith(expect.objectContaining({ limit: 1000 }));

    await GET(new Request("http://localhost/api/listings?limit=invalid"));
    expect(listEvents).toHaveBeenLastCalledWith(expect.objectContaining({ limit: 200 }));
  });

  it.each(["2026-02-29", "2026-04-31", "2026-13-01", "2026-1-01", "0000-01-01"])("rejects impossible or malformed date %s before querying", async (date) => {
    const response = await GET(new Request(`http://localhost/api/listings?from=${date}`));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false, error: "INVALID_DATE_RANGE" });
    expect(listEvents).not.toHaveBeenCalled();
  });

  it("accepts valid Gregorian leap days", async () => {
    const response = await GET(new Request("http://localhost/api/listings?from=2024-02-29&to=2024-03-01"));
    expect(response.status).toBe(200);
    expect(listEvents).toHaveBeenCalledWith(expect.objectContaining({ from: "2024-02-29", to: "2024-03-01" }));
  });
});
