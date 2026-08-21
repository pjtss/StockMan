import { describe, expect, it } from "vitest";
import { detectBollingerRebound } from "./bollinger-rebound";

const policy = { enabled: true, lookback: 3, tolerancePercent: 0.5 };

describe("Bollinger lower-band rebound", () => {
  it("qualifies after a prior break and current lower-band retest", () => {
    const result = detectBollingerRebound([
      { close: 100, lower: 95 },
      { close: 90, lower: 95 },
      { close: 95.2, lower: 95 },
    ], policy);
    expect(result.qualifies).toBe(true);
    expect(result.state).toBe("RETOUCH_AFTER_BREAKOUT");
  });

  it("does not qualify while the latest close remains below the lower band", () => {
    const result = detectBollingerRebound([{ close: 90, lower: 95 }, { close: 92, lower: 95 }], policy);
    expect(result.qualifies).toBe(false);
    expect(result.state).toBe("BREAKOUT_BELOW");
  });
});
