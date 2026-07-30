import { describe, expect, it } from "vitest";
import { decideTradeIntensityAlert } from "./us-trade-intensity-alert";
import type { TradeIntensityScore } from "./us-trade-intensity-metrics";

const score = (level: TradeIntensityScore["level"]): TradeIntensityScore => ({ score: level === "STRONG" ? 85 : level === "WATCH" ? 65 : 20, level, reasons: [], failedConditions: [] });

describe("trade intensity alert decision", () => {
  it("does not alert rejected or watch-only candidates", () => {
    expect(decideTradeIntensityAlert({ market: "NAS", code: "AAPL", score: score("REJECT") }).shouldAlert).toBe(false);
    expect(decideTradeIntensityAlert({ market: "NAS", code: "AAPL", score: score("WATCH") }).state).toBe("WATCH");
  });

  it("alerts a strong candidate and suppresses it during cooldown", () => {
    const now = new Date("2026-01-01T00:10:00Z");
    expect(decideTradeIntensityAlert({ market: "NAS", code: "AAPL", score: score("STRONG"), now, cooldownSeconds: 600 }).state).toBe("QUALIFIED");
    expect(decideTradeIntensityAlert({ market: "NAS", code: "AAPL", score: score("STRONG"), now, lastAlertAt: new Date("2026-01-01T00:05:00Z"), cooldownSeconds: 600 }).state).toBe("COOLDOWN");
  });
});
