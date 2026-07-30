import { fetchKisUsTradeTrend, type KisUsTradeMarket } from "@/lib/kis-us-trade-trend";
import { calculateTradeIntensityMetrics, scoreTradeIntensity, type TradeIntensityMetrics, type TradeIntensityScore } from "@/lib/us-trade-intensity-metrics";
import { loadUsTradeIntensityTicks } from "@/lib/us-trade-intensity-repository";
import { getTickerInfo, type TickerInfo } from "@/lib/discord-ticker-command";
import { getUsFreeFloat, type UsFreeFloatOverview } from "@/lib/us-free-float";
import { formatKoreanCompact } from "@/lib/korean-number-format";
import { fetchFinraComposite } from "@/lib/finra-short-composite";
import { scoreShortInterest, type ShortInterestScore } from "@/lib/short-interest-score";
import type { ShortInterestMetric } from "@/lib/short-interest-types";
import { fetchShortBorrow } from "@/lib/short-borrow-service";
import type { ShortBorrowResult } from "@/lib/alpaca-short-borrow";

export type TickerOverview = {
  quote: TickerInfo;
  intensity: { metrics: TradeIntensityMetrics; score: TradeIntensityScore } | null;
  intensityStatus: "OK" | "UNAVAILABLE";
  freeFloat: UsFreeFloatOverview;
  shortInterest: { metric: ShortInterestMetric; score: ShortInterestScore; shortInterestStatus: string; thresholdStatus: string };
  shortBorrow: ShortBorrowResult | null;
  shortBorrowStatus: "OK" | "UNAVAILABLE";
  shortBorrowError?: string;
};

/** Composes independent ticker data sources; formatting remains the Discord adapter's responsibility. */
export async function getTickerOverview(rawTicker: string): Promise<TickerOverview | null> {
  const quote = await getTickerInfo(rawTicker);
  if (!quote) return null;
  const freeFloatPromise = getUsFreeFloat(quote.ticker);
  const shortInterestPromise = fetchFinraComposite(quote.ticker);
  const shortBorrowPromise = fetchShortBorrow(quote.ticker, { currentPrice: quote.price }).catch((error) => ({ error: error instanceof Error ? error.message : String(error) }));
  const compose = async (intensityResult: TickerOverview["intensity"]): Promise<TickerOverview> => {
    const [composite, freeFloat, borrow] = await Promise.all([shortInterestPromise, freeFloatPromise, shortBorrowPromise]);
    const borrowAvailable = "error" in borrow ? null : borrow;
    const borrowError = "error" in borrow ? borrow.error : undefined;
    return { quote, intensity: intensityResult, intensityStatus: intensityResult ? "OK" : "UNAVAILABLE", freeFloat, shortInterest: { ...composite, score: scoreShortInterest(composite.metric) }, shortBorrow: borrowAvailable, shortBorrowStatus: borrowAvailable ? "OK" : "UNAVAILABLE", ...(borrowError ? { shortBorrowError: borrowError } : {}) };
  };
  try {
    const trend = await fetchKisUsTradeTrend({ code: quote.ticker, market: quote.market as KisUsTradeMarket, day: "1" });
    if (!trend?.ok || trend.trades.length === 0) return compose(null);
    const fetchedAt = new Date();
    const stored = await loadUsTradeIntensityTicks({ market: quote.market, code: quote.ticker }, new Date(fetchedAt.getTime() - 30 * 60_000), fetchedAt);
    const trades = stored.length > 0 ? stored.map((row) => ({ time: row.tradeTime, price: row.price, changeRate: row.changeRate, volume: row.volume, totalVolume: row.totalVolume, marketType: row.marketType ?? "", bid: row.bid, ask: row.ask, intensity: row.intensity })) : trend.trades;
    const metrics = calculateTradeIntensityMetrics(trades);
    return compose({ metrics, score: scoreTradeIntensity(metrics) });
  } catch {
    return compose(null);
  }
}

function number(value: number | null, suffix = "") {
  return formatKoreanCompact(value, suffix);
}

export function formatTickerOverview(overview: TickerOverview | null) {
  if (!overview) return "해당 티커를 지원되는 미국 주식(NAS/NYS/AMS)에서 찾을 수 없습니다.";
  const { quote, intensity } = overview;
  const lines = [
    `📊 **${quote.ticker} | ${quote.name}**`, `${quote.market} · 현재가 **${number(quote.price)}** · **${number(quote.rate, "%")}**`,
    "", "**시세**", `시가 ${number(quote.open)} · 고가 ${number(quote.high)} · 저가 ${number(quote.low)}`,
    `거래량 ${number(quote.volume)} · 거래대금 ${number(quote.tradingValue)} · 시가총액 ${number(quote.marketCap)}`,
  ];
  const float = overview.freeFloat;
  lines.push("", "**유통주**", float.ok ? `유통주식수 ${number(float.floatShares)} · 유통비율 ${number(float.freeFloatPercent, "%")}` : "유통주 데이터 없음");
  if (float.ok) lines.push(`유통 시가총액 ${number(quote.price == null ? null : quote.price * (float.floatShares ?? 0))}`, `기준일 ${float.asOf ?? "-"} · 출처 ${float.source}${float.cached ? " · DB 캐시" : ""}`);
  const short = overview.shortInterest;
  lines.push("", "**공매도**", short.metric.status === "OK" || short.metric.status === "ZERO_SHORT_VOLUME" ? `일별 공매도 비율 ${number(short.metric.shortVolumeRatio, "%")} · 공매도 거래량 ${number(short.metric.shortVolume)} · 판정 **${short.score.level}**` : `공매도 데이터 ${short.metric.status} · ${short.metric.reason || "원인 확인 필요"}`);
  if (short.metric.status === "OK") lines.push(`당일 거래량 기준일 ${short.metric.shortVolumeAsOf ?? short.metric.asOf ?? "-"} · 출처 ${short.metric.source}`);
  if (short.metric.shortInterest != null) lines.push(`공매도 잔고 ${number(short.metric.shortInterest)} · Days to Cover ${number(short.metric.daysToCover)} · 잔고 기준일 ${short.metric.shortInterestAsOf ?? "-"}${short.shortInterestStatus === "STALE" ? " · 오래된 데이터" : ""}`);
  if (short.metric.shortInterestChangePercent != null) lines.push(`잔고 증감률 ${number(short.metric.shortInterestChangePercent, "%")}`);
  lines.push(`Threshold List ${short.metric.thresholdListed === true ? "포함" : short.metric.thresholdListed === false ? "미포함" : "확인 불가"}`);
  const borrow = overview.shortBorrow;
  lines.push("", "**대차·Locate**", borrow ? `대차 가능 여부 ${borrow.borrowStatus} · 대차 가능 수량 ${number(borrow.availableQty)} · 예상 Locate 비용 $${number(borrow.locatePricePerShare)} · 기준 ${borrow.quotedAt ?? borrow.fetchedAt}` : `대차 데이터 없음${overview.shortBorrowError ? ` · ${overview.shortBorrowError}` : ""}`);
  if (intensity) {
    const m = intensity.metrics;
    lines.push("", "**최근 체결강도**", `최근 평균 ${number(m.recentAverageIntensity)} · 직전 대비 ${number(m.intensityChange)}`, `100 이상 비율 ${number(m.intensityAbove100Rate == null ? null : m.intensityAbove100Rate * 100, "%")} · 판정 **${intensity.score.level}**`);
  } else lines.push("", "체결강도: 데이터 부족");
  return lines.join("\n");
}
