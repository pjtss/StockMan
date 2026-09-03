import { describe, expect, it, vi } from "vitest";

const allowed = vi.hoisted(() => ({ value: false }));
const fetchCandles = vi.hoisted(() => vi.fn());
const saveCandles = vi.hoisted(() => vi.fn());
vi.mock("@/lib/admin-auth", () => ({ requireAdminSession: vi.fn(async () => allowed.value) }));
vi.mock("@/lib/kr-minute-candle-cache", () => ({ fetchKrMinuteCandles: fetchCandles, saveKrMinuteCandles: saveCandles }));
import { POST } from "./route";

describe("KR minute candles admin API", () => {
  it("rejects unauthenticated requests before parsing or fetching", async () => {
    allowed.value = false;
    expect((await POST(new Request("http://localhost", { method: "POST", body: "not-json" }))).status).toBe(401);
    expect(fetchCandles).not.toHaveBeenCalled();
  });

  it("accepts a valid authenticated domestic ticker", async () => {
    allowed.value = true;
    fetchCandles.mockResolvedValueOnce([{ date: "2026-09-02" }]);
    saveCandles.mockResolvedValueOnce(1);
    const response = await POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ code: "005930", market: "KOSPI" }) }));
    expect(response.status).toBe(200);
    expect(fetchCandles).toHaveBeenCalledWith("005930", 30, "KOSPI");
  });
});
