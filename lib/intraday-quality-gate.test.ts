import { describe, expect, it } from "vitest";
import { evaluateIntradayQuality } from "./intraday-quality-gate";

const observation = (sourceObservedAt: number) => ({ sourceObservedAt, receivedAt: sourceObservedAt + 1000, sessionId: "session-1", currentPrice: 10, volume: 100, tradingValue: 1000, vwap: 9, aboveVwap: true });
describe("intraday quality gate", () => {
  it("requires two fresh observations", () => { expect(evaluateIntradayQuality(observation(1000), 1, 2000).qualified).toBe(false); expect(evaluateIntradayQuality(observation(1000), 2, 2000).state).toBe("QUALIFIED"); });
  it("blocks stale and session-mismatched data", () => { expect(evaluateIntradayQuality(observation(1000), 2, 70_000).state).toBe("STALE"); expect(evaluateIntradayQuality({ ...observation(1000), sessionId: "other" }, 2, 2000, { maxAgeSeconds: 60, requiredConsecutiveObservations: 2, expectedSessionId: "session-1" }).state).toBe("DEGRADED"); });
  it("does not qualify incomplete volume or source time", () => { expect(evaluateIntradayQuality({ ...observation(1000), volume: 0 }, 2, 2000).qualified).toBe(false); expect(evaluateIntradayQuality({ ...observation(1000), sourceObservedAt: null }, 2, 2000).qualified).toBe(false); });
});
