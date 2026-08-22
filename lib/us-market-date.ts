import type { UsDailyCandle } from "@/lib/kis-us-daily-price";

/** KIS daily candles use the US market's calendar date, not the KST date. */
export function currentUsMarketDate(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", weekday: "short", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value) - 1;
  const day = Number(parts.find((part) => part.type === "day")?.value);
  const weekday = parts.find((part) => part.type === "weekday")?.value;
  const date = new Date(Date.UTC(year, month, day));
  // KIS has no Saturday/Sunday candle. Use Friday during the weekend.
  if (weekday === "Sat") date.setUTCDate(date.getUTCDate() - 1);
  if (weekday === "Sun") date.setUTCDate(date.getUTCDate() - 2);
  return date.toISOString().slice(0, 10).replaceAll("-", "");
}

export function dateKey(value: string) {
  return value.replace(/[^0-9]/g, "");
}

/** Historical indicators must not consume a partially formed current-session candle. */
export function excludeCurrentUsMarketCandle(candles: UsDailyCandle[], marketDate = currentUsMarketDate()) {
  return candles.filter((candle) => dateKey(candle.date) !== marketDate);
}
