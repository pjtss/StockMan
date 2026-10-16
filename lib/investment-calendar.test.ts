import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.hoisted(() => vi.fn());
vi.mock("./db", () => ({ getPool: () => ({ query }) }));

import { listInvestmentCalendarEvents } from "./investment-calendar";

describe("listInvestmentCalendarEvents", () => {
  beforeEach(() => query.mockReset().mockResolvedValue({ rows: [] }));

  it("always binds an integer limit, including when called outside the route", async () => {
    await listInvestmentCalendarEvents({ from: "2026-10-01", to: "2026-10-31", limit: 4.9 });
    expect(query.mock.calls[0][1].at(-1)).toBe(4);
  });

  it("uses a safe default for non-finite limits and clamps valid integer limits", async () => {
    await listInvestmentCalendarEvents({ from: "2026-10-01", to: "2026-10-31", limit: Number.NaN });
    expect(query.mock.calls[0][1].at(-1)).toBe(200);
    await listInvestmentCalendarEvents({ from: "2026-10-01", to: "2026-10-31", limit: 5000 });
    expect(query.mock.calls[1][1].at(-1)).toBe(1000);
  });
});
