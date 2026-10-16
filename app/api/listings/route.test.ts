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
});
