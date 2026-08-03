import { fetchKisUsPriceDetail, getKisUsPriceDetailOutput } from "@/lib/kis-us-price-detail";
import { fetchUsDailyPrice, type UsDailyCandle } from "@/lib/kis-us-daily-price";

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

function valueNumber(value: unknown) {
  const parsed = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function signedNumber(value: unknown) {
  const parsed = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

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

export async function findUsFiveDayHighBreakout({ code: rawCode, market: rawMarket, asOfDate }: UsFiveDayHighBreakoutRequest): Promise<UsFiveDayHighBreakoutResult> {
  const code = rawCode.trim().toUpperCase();
  const requestedMarket = rawMarket.trim().toUpperCase();
  if (!code || !requestedMarket) throw new Error("code and market are required");
  const markets = [requestedMarket, ...["AMS", "NAS", "NYS"].filter((value) => value !== requestedMarket)];
  let lastFailure: UsFiveDayHighBreakoutResult | null = null;
  for (const market of markets) {
    const daily = await fetchUsDailyPrice({ code, market, endDate: asOfDate });
    if (!daily) {
      lastFailure = { ok: false, code, market, currentPrice: null, previousFiveDayHigh: null, previousFiveTradingDays: [], rate: null, volume: null, marketCap: null, tradingValue: null, turnoverRatio: null, qualifies: false, daily: { ok: false, status: 0, candleCount: 0 }, price: { ok: false, status: 0 }, error: "KIS access token unavailable" };
      continue;
    }
    const previous = selectPreviousFiveTradingDays(daily.candles, asOfDate);
    if (!daily.ok || previous.length < 5) {
      lastFailure = { ok: false, code, market, currentPrice: null, previousFiveDayHigh: previous.length ? Math.max(...previous.map((candle) => candle.high)) : null, previousFiveTradingDays: previous.map((candle) => candle.date), rate: null, volume: null, marketCap: null, tradingValue: null, turnoverRatio: null, qualifies: false, daily: { ok: daily.ok, status: daily.status, candleCount: daily.candles.length, rawText: daily.response.rawText.slice(0, 1000), diagnostics: daily.diagnostics }, price: { ok: false, status: 0 }, error: !daily.ok ? `KIS daily API failed (${daily.status})` : `insufficient prior candles (${previous.length}/5)` };
      continue;
    }
    const price = await fetchKisUsPriceDetail({ code, market });
    const output = getKisUsPriceDetailOutput(price?.parsed);
    const currentPrice = valueNumber(output.last ?? output.stck_prpr ?? output.ovrs_nmix_prpr ?? output.price);
    if (!price?.ok || currentPrice === null) {
      lastFailure = { ok: false, code, market, currentPrice: null, previousFiveDayHigh: Math.max(...previous.map((candle) => candle.high)), previousFiveTradingDays: previous.map((candle) => candle.date), rate: null, volume: null, marketCap: null, tradingValue: null, turnoverRatio: null, qualifies: false, daily: { ok: daily.ok, status: daily.status, candleCount: daily.candles.length, diagnostics: daily.diagnostics }, price: { ok: Boolean(price?.ok), status: price?.status ?? 0, raw: price?.parsed }, error: !price ? "KIS price detail response unavailable" : !price.ok ? `KIS price detail API failed (${price.status})` : "current price field missing or invalid" };
      continue;
    }
    const rate = signedNumber(output.t_xrat ?? output.rate ?? output.prdy_ctrt ?? output.changeRate);
    const volume = valueNumber(output.tvol ?? output.acml_vol ?? output.volume);
    const marketCap = valueNumber(output.tomv ?? output.hts_avls ?? output.marketCap);
    const tradingValue = valueNumber(output.tamt ?? output.tamnt ?? output.tot_tr_pbmn ?? output.tradingValue);
    const previousFiveDayHigh = Math.max(...previous.map((candle) => candle.high));
    return { ok: true, code, market, currentPrice, previousFiveDayHigh, previousFiveTradingDays: previous.map((candle) => candle.date), rate, volume, marketCap, tradingValue, turnoverRatio: marketCap && tradingValue ? tradingValue / marketCap * 100 : null, qualifies: currentPrice > previousFiveDayHigh, daily: { ok: daily.ok, status: daily.status, candleCount: daily.candles.length, diagnostics: daily.diagnostics }, price: { ok: true, status: price.status, raw: price.parsed } };
  }
  return lastFailure ?? { ok: false, code, market: requestedMarket, currentPrice: null, previousFiveDayHigh: null, previousFiveTradingDays: [], rate: null, volume: null, marketCap: null, tradingValue: null, turnoverRatio: null, qualifies: false, daily: { ok: false, status: 0, candleCount: 0 }, price: { ok: false, status: 0 }, error: "no market response" };
}
