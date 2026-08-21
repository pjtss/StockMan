import { describe, expect, it } from "vitest";
import { findRecentLowerBandTouch } from "./bollinger-lower-touch";
const p = (date: string, close: number, lower = 10) => ({ date, close, lower });
describe("recent lower-band touch", () => {
  it("qualifies on the latest candle", () => expect(findRecentLowerBandTouch([p("1", 12), p("2", 10)]).isCurrent).toBe(true));
  it("qualifies on the immediately preceding trading candle", () => {
    const result = findRecentLowerBandTouch([p("1", 10), p("2", 12)]);
    expect(result.qualifies).toBe(true); expect(result.isCurrent).toBe(false);
  });
  it("does not look back beyond one candle", () => expect(findRecentLowerBandTouch([p("1", 10), p("2", 12), p("3", 12)]).qualifies).toBe(false));
});
