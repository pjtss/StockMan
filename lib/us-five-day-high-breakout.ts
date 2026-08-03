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
  daily: { ok: boolean; status: number; candleCount: number; rawText?: string };
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
  const market = rawMarket.trim().toUpperCase();
  if (!code || !market) throw new Error("code and market are required");
  const daily = await fetchUsDailyPrice({ code, market, endDate: asOfDate });
  if (!daily) return { ok: false, code, market, currentPrice: null, previousFiveDayHigh: null, previousFiveTradingDays: [], rate: null, volume: null, marketCap: null, tradingValue: null, turnoverRatio: null, qualifies: false, daily: { ok: false, status: 0, candleCount: 0 }, price: { ok: false, status: 0 }, error: "KIS access token unavailable" };
  const previous = selectPreviousFiveTradingDays(daily.candles, asOfDate);
  if (!daily.ok || previous.length < 5) return { ok: false, code, market, currentPrice: null, previousFiveDayHigh: previous.length ? Math.max(...previous.map((candle) => candle.high)) : null, previousFiveTradingDays: previous.map((candle) => candle.date), rate: null, volume: null, marketCap: null, tradingValue: null, turnoverRatio: null, qualifies: false, daily: { ok: daily.ok, status: daily.status, candleCount: daily.candles.length, rawText: daily.response.rawText.slice(0, 1000) }, price: { ok: false, status: 0 }, error: !daily.ok ? `daily price API failed (${daily.status})` : "fewer than five prior trading days" };
  const price = await fetchKisUsPriceDetail({ code, market });
  const output = getKisUsPriceDetailOutput(price?.parsed);
  const currentPrice = valueNumber(output.last ?? output.stck_prpr ?? output.ovrs_nmix_prpr ?? output.price);
  const rate = signedNumber(output.t_xrat ?? output.rate ?? output.prdy_ctrt ?? output.changeRate);
  const volume = valueNumber(output.tvol ?? output.acml_vol ?? output.volume);
  const marketCap = valueNumber(output.tomv ?? output.hts_avls ?? output.marketCap);
  const tradingValue = valueNumber(output.tamt ?? output.tamnt ?? output.tot_tr_pbmn ?? output.tradingValue);
  const previousFiveDayHigh = Math.max(...previous.map((candle) => candle.high));
  return { ok: Boolean(price?.ok && currentPrice !== null), code, market, currentPrice, previousFiveDayHigh, previousFiveTradingDays: previous.map((candle) => candle.date), rate, volume, marketCap, tradingValue, turnoverRatio: marketCap && tradingValue ? tradingValue / marketCap * 100 : null, qualifies: currentPrice !== null && currentPrice > previousFiveDayHigh, daily: { ok: daily.ok, status: daily.status, candleCount: daily.candles.length }, price: { ok: Boolean(price?.ok), status: price?.status ?? 0, raw: price?.parsed }, error: currentPrice === null ? "current price unavailable" : undefined };
}
