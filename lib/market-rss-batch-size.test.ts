import { describe, expect, it } from "vitest";
import { getMarketRssBatchSize } from "./market-rss-batch-size";

describe("market RSS batch size configuration", () => {
  it.each([undefined, "", "  ", "0", "-1", "1.5", "NaN", "Infinity", "9007199254740992"])(
    "uses the fallback for invalid value %s",
    (value) => expect(getMarketRssBatchSize(value, 50)).toBe(50),
  );

  it("accepts positive integers and caps unusually large batches", () => {
    expect(getMarketRssBatchSize("25", 50)).toBe(25);
    expect(getMarketRssBatchSize(" 7 ", 10)).toBe(7);
    expect(getMarketRssBatchSize("2000", 50)).toBe(1_000);
    expect(getMarketRssBatchSize("1000", 50, 100)).toBe(100);
  });
});
