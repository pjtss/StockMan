import { describe, expect, it } from "vitest";
import { buildUsDailyPriceUrl, parseUsDailyPriceRows, type UsDailyCandle } from "./kis-us-daily-price";

const validUsCandle: UsDailyCandle = {
  date: "20261110", open: 10, high: 12, low: 9, close: 11, volume: 100, raw: {},
};

describe("KIS US daily price", () => {
  it("builds the ticker-based daily price request", () => {
    const url = buildUsDailyPriceUrl({ code: "aapl", market: "nas", endDate: "2026-07-31" }, { AUTH: "", KEYB: "" });
    const parsed = new URL(url);
    expect(parsed.pathname).toBe("/uapi/overseas-price/v1/quotations/dailyprice");
    expect(parsed.searchParams.get("EXCD")).toBe("NAS");
    expect(parsed.searchParams.get("SYMB")).toBe("AAPL");
    expect(parsed.searchParams.get("BYMD")).toBe("20260731");
    expect(parsed.searchParams.get("GUBN")).toBe("0");
  });

  it("defaults to adjusted prices", () => {
    const url = buildUsDailyPriceUrl({ code: "TSLA", market: "NYS" });
    expect(new URL(url).searchParams.get("MODP")).toBe("1");
  });

  it("drops invalid dates, incomplete OHLCV and impossible price ranges", () => {
    const invalid = [
      { ...validUsCandle, date: "20260230" },
      { ...validUsCandle, open: Number.NaN },
      { ...validUsCandle, volume: -1 },
      { ...validUsCandle, high: 10.5 },
      { ...validUsCandle, low: 10.5 },
    ];
    const candles = parseUsDailyPriceRows([validUsCandle, ...invalid]);
    expect(candles).toHaveLength(1);
    expect(candles[0]).toMatchObject({ date: "20261110", open: 10, high: 12, low: 9, close: 11, volume: 100 });
  });
});

