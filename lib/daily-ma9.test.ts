import { describe, expect, it } from "vitest";
import { evaluateDailyMa9 } from "@/lib/daily-ma9";

describe("daily 9-day moving average detector", () => {
  it("qualifies when the latest close is above the nine-day EMA", () => {
    const candles = Array.from({ length: 9 }, (_, index) => ({ date: `202608${String(index + 1).padStart(2, "0")}`, close: index === 8 ? 110 : 100 }));
    const result = evaluateDailyMa9(candles, { market: "NAS", code: "TEST", name: "Test" });
    expect(result.status).toBe("ABOVE_MA9");
    expect(result.qualifies).toBe(true);
    expect(result.ema9).toBeCloseTo(102, 5);
  });
  it("does not qualify with fewer than nine valid candles", () => {
    const result = evaluateDailyMa9([{ date: "20260801", close: 100 }], { market: "KRX", code: "000001" });
    expect(result.status).toBe("INSUFFICIENT_HISTORY");
  });
});
