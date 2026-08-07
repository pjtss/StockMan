import { type UsDailyCandle } from "@/lib/kis-us-daily-price";
import { loadCachedUsDailyCandles } from "@/lib/us-daily-price-cache";

export type UsFiveDayHighBreakoutRequest = { code: string; market: string; asOfDate?: string };

export type UsFiveDayHighBreakoutResult = {
  ok: boolean;
  code: string;
  market: string;
  currentPrice: number | null;
  previousFiveDayHigh: number | null;
  previousFiveTradingDays: string[];
  rate: number | null;
  volume: number | null;
  marketCap: number | null;
  tradingValue: number | null;
  turnoverRatio: number | null;
  freeFloatShares?: number | null;
  freeFloatPercent?: number | null;
  qualifies: boolean;
  daily: { ok: boolean; status: number; candleCount: number; rawText?: string; diagnostics?: unknown };
  price: { ok: boolean; status: number; raw?: unknown };
  error?: string;
};

function dateKey(value: string) { return value.replace(/[^0-9]/g, ""); }

function currentKstDate() {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}`;
}

export function selectPreviousFiveTradingDays(candles: UsDailyCandle[], asOfDate?: string) {
  const cutoff = dateKey(asOfDate || currentKstDate());
  return [...candles]
    .filter((candle) => !cutoff || dateKey(candle.date) < cutoff)
    .sort((a, b) => dateKey(b.date).localeCompare(dateKey(a.date)))
    .slice(0, 5);
}

export async function findUsFiveDayHighBreakout({ code: rawCode, market: rawMarket, asOfDate, cachedCandles: prefetchedCandles }: UsFiveDayHighBreakoutRequest & { cachedCandles?: UsDailyCandle[] }): Promise<UsFiveDayHighBreakoutResult> {
  const code = rawCode.trim().toUpperCase();
  const requestedMarket = rawMarket.trim().toUpperCase();
  if (!code || !requestedMarket) throw new Error("code and market are required");
  const markets = [requestedMarket, ...["AMS", "NAS", "NYS"].filter((value) => value !== requestedMarket)];
  let lastFailure: UsFiveDayHighBreakoutResult | null = null;
  for (const market of markets) {
    const cachedCandles = market === requestedMarket && prefetchedCandles ? prefetchedCandles : await loadCachedUsDailyCandles(market, code, 10).catch(() => []);
    const cachedPrevious = selectPreviousFiveTradingDays(cachedCandles, asOfDate);
    const daily = cachedPrevious.length >= 5
      ? { ok: true, status: 200, candles: cachedCandles, response: { rawText: "", parsed: null }, diagnostics: { source: "DB_CACHE", parsedCandleCount: cachedCandles.length, firstDate: cachedCandles.at(-1)?.date ?? null, lastDate: cachedCandles[0]?.date ?? null } }
      : { ok: false, status: 0, candles: cachedCandles, response: { rawText: "", parsed: null }, diagnostics: { source: "DB_CACHE_ONLY", parsedCandleCount: cachedCandles.length } };
    if (!daily) {
      lastFailure = { ok: false, code, market, currentPrice: null, previousFiveDayHigh: null, previousFiveTradingDays: [], rate: null, volume: null, marketCap: null, tradingValue: null, turnoverRatio: null, qualifies: false, daily: { ok: false, status: 0, candleCount: 0 }, price: { ok: false, status: 0 }, error: "KIS access token unavailable" };
      continue;
    }
    const previous = selectPreviousFiveTradingDays(daily.candles, asOfDate);
    if (!daily.ok || previous.length < 5) {
      lastFailure = { ok: false, code, market, currentPrice: null, previousFiveDayHigh: previous.length ? Math.max(...previous.map((candle) => candle.high)) : null, previousFiveTradingDays: previous.map((candle) => candle.date), rate: null, volume: null, marketCap: null, tradingValue: null, turnoverRatio: null, qualifies: false, daily: { ok: daily.ok, status: daily.status, candleCount: daily.candles.length, rawText: daily.response.rawText.slice(0, 1000), diagnostics: daily.diagnostics }, price: { ok: false, status: 0 }, error: !daily.ok ? `KIS daily API failed (${daily.status})` : `insufficient prior candles (${previous.length}/5)` };
      continue;
    }
    const cutoff = dateKey(asOfDate || currentKstDate());
    const currentCandle = daily.candles.find((candle) => dateKey(candle.date) === cutoff);
    const currentPrice = currentCandle?.open ?? null;
    if (!currentCandle || currentPrice == null || !Number.isFinite(currentPrice) || currentPrice <= 0) {
      lastFailure = { ok: false, code, market, currentPrice: null, previousFiveDayHigh: Math.max(...previous.map((candle) => candle.high)), previousFiveTradingDays: previous.map((candle) => candle.date), rate: null, volume: null, marketCap: null, tradingValue: null, turnoverRatio: null, qualifies: false, daily: { ok: daily.ok, status: daily.status, candleCount: daily.candles.length, diagnostics: daily.diagnostics }, price: { ok: false, status: 200 }, error: "today open candle unavailable in DB cache" };
      continue;
    }
    const today = currentCandle;
    const previousFiveDayHigh = Math.max(...previous.map((candle) => candle.high));
    return { ok: true, code, market, currentPrice, previousFiveDayHigh, previousFiveTradingDays: previous.map((candle) => candle.date), rate: null, volume: today.volume ?? null, marketCap: null, tradingValue: today.close != null && today.volume != null ? today.close * today.volume : null, turnoverRatio: null, qualifies: currentPrice > previousFiveDayHigh, daily: { ok: daily.ok, status: daily.status, candleCount: daily.candles.length, rawText: daily.response.rawText || undefined, diagnostics: { ...(daily.diagnostics as Record<string, unknown>), source: "DB_CACHE", comparison: "today_open_vs_previous_five_day_high", currentDate: today.date } }, price: { ok: true, status: 200, raw: { source: "DB_CACHE", field: "open" } } };
  }
  return lastFailure ?? { ok: false, code, market: requestedMarket, currentPrice: null, previousFiveDayHigh: null, previousFiveTradingDays: [], rate: null, volume: null, marketCap: null, tradingValue: null, turnoverRatio: null, qualifies: false, daily: { ok: false, status: 0, candleCount: 0 }, price: { ok: false, status: 0 }, error: "no market response" };
}
