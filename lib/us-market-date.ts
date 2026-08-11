import type { UsDailyCandle } from "@/lib/kis-us-daily-price";

/** KIS daily candles use the US market's calendar date, not the KST date. */
export function currentUsMarketDate(value = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(value).replaceAll("-", "");
}

export function dateKey(value: string) {
  return value.replace(/[^0-9]/g, "");
}

/** Historical indicators must not consume a partially formed current-session candle. */
export function excludeCurrentUsMarketCandle(candles: UsDailyCandle[], marketDate = currentUsMarketDate()) {
  return candles.filter((candle) => dateKey(candle.date) !== marketDate);
}
