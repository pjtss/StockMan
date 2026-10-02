import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  query: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ getPool: () => ({ query: state.query }) }));

import { GET } from "./route";

describe("RSS translation diagnostics API", () => {
  beforeEach(() => {
    state.query.mockReset();
  });

  it("allows unauthenticated read access to the deliberately limited diagnostics", async () => {
    state.query
      .mockResolvedValueOnce({ rows: [{ status: "PENDING", count: 1 }] })
      .mockResolvedValueOnce({ rows: [{ count: 1 }] })
      .mockResolvedValueOnce({ rows: [] });
    const response = await GET(new Request("http://localhost/api/debug/market-rss-translations"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.summary.byStatus).toEqual({ PENDING: 1 });
    expect(state.query).toHaveBeenCalledTimes(3);
  });

  it("returns bounded translation state, status counts and applies filters", async () => {
    state.query
      .mockResolvedValueOnce({ rows: [{ status: "TRANSLATED", count: 4 }, { status: "FAILED", count: 2 }] })
      .mockResolvedValueOnce({ rows: [{ count: 2 }] })
      .mockResolvedValueOnce({ rows: [{ id: 8, translation_error: null, translated_title: "번역 제목" }] });

    const response = await GET(new Request("http://localhost/api/debug/market-rss-translations?hours=48&source=STOCKTITAN&status=FAILED&limit=10&offset=0"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.scope).toMatchObject({ createdWithinHours: 48, source: "STOCKTITAN", status: "FAILED" });
    expect(body.summary).toMatchObject({ totalInWindow: 6, filteredTotal: 2, byStatus: { TRANSLATED: 4, FAILED: 2 } });
    expect(body.items).toHaveLength(1);
    expect(state.query).toHaveBeenCalledTimes(3);
    expect(state.query.mock.calls.map((call) => call[1])).toEqual([[48, "STOCKTITAN"], [48, "STOCKTITAN", "FAILED"], [48, "STOCKTITAN", "FAILED", 10, 0]]);
  });

  it("rejects invalid source, status and out-of-range query bounds", async () => {
    for (const query of ["?source=UNKNOWN", "?status=UNKNOWN", "?hours=721", "?limit=101"]) {
      const response = await GET(new Request(`http://localhost/api/debug/market-rss-translations${query}`));
      expect(response.status).toBe(400);
    }
    expect(state.query).not.toHaveBeenCalled();
  });

  it("sanitizes saved translation errors and does not reveal raw database failures", async () => {
    state.query
      .mockResolvedValueOnce({ rows: [{ status: "FAILED", count: 1 }] })
      .mockResolvedValueOnce({ rows: [{ count: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: 9, translation_error: "https://translate.example/?key=AIzaSyDUMMY012345678901234567890123456789 failed; token=secret" }] });
    const body = await (await GET(new Request("http://localhost/api/debug/market-rss-translations"))).json();
    expect(JSON.stringify(body)).not.toContain("AIzaSyDUMMY");
    expect(JSON.stringify(body)).not.toContain("token=secret");

    state.query.mockRejectedValue(new Error("postgres://private-connection-string"));
    const failedBody = await (await GET(new Request("http://localhost/api/debug/market-rss-translations"))).json();
    expect(failedBody).toMatchObject({ ok: false, error: "RSS_TRANSLATION_DIAGNOSTICS_UNAVAILABLE" });
    expect(JSON.stringify(failedBody)).not.toContain("private-connection-string");
  });
});
