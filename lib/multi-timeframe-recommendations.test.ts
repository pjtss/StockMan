import { describe, expect, it } from "vitest";
import { calculateDayTradeFlowState, latestCompletedDailyDate } from "./multi-timeframe-recommendations";

describe("multi-timeframe day-trade flow", () => {
  it("uses OHLC money-flow multiplier for ADL", () => {
    const rows = Array.from({ length: 30 }, (_, index) => ({
      date: `202609${String(index + 1).padStart(2, "0")}`,
      open: 99 + index,
      high: 100.5 + index,
      low: 99 + index,
      close: 100 + index,
      volume: 100,
      updatedAt: null,
    }));
    const flow = calculateDayTradeFlowState(rows);
    expect(flow.adl).toBeGreaterThan(0);
    expect(flow.adlAboveSignal).toBe(true);
  });
  it("uses the latest completed daily date as the scan basis", () => {
    expect(latestCompletedDailyDate([{ D: [{ date: "20260917" } as any] }, { D: [{ date: "20260918" } as any] }])).toBe("20260918");
  });
});
