import { fetchKisUsTradeTrend, type KisUsTradeMarket } from "@/lib/kis-us-trade-trend";
import { calculateTradeIntensityMetrics, scoreTradeIntensity, type TradeIntensityMetrics, type TradeIntensityScore } from "@/lib/us-trade-intensity-metrics";
import { loadUsTradeIntensityTicks } from "@/lib/us-trade-intensity-repository";
import { getTickerInfo, type TickerInfo } from "@/lib/discord-ticker-command";

export type TickerOverview = {
  quote: TickerInfo;
  intensity: { metrics: TradeIntensityMetrics; score: TradeIntensityScore } | null;
  intensityStatus: "OK" | "UNAVAILABLE";
};

/** Composes independent ticker data sources; formatting remains the Discord adapter's responsibility. */
export async function getTickerOverview(rawTicker: string): Promise<TickerOverview | null> {
  const quote = await getTickerInfo(rawTicker);
  if (!quote) return null;
  try {
    const trend = await fetchKisUsTradeTrend({ code: quote.ticker, market: quote.market as KisUsTradeMarket, day: "1" });
    if (!trend?.ok || trend.trades.length === 0) return { quote, intensity: null, intensityStatus: "UNAVAILABLE" };
    const fetchedAt = new Date();
    const stored = await loadUsTradeIntensityTicks({ market: quote.market, code: quote.ticker }, new Date(fetchedAt.getTime() - 30 * 60_000), fetchedAt);
    const trades = stored.length > 0 ? stored.map((row) => ({ time: row.tradeTime, price: row.price, changeRate: row.changeRate, volume: row.volume, totalVolume: row.totalVolume, marketType: row.marketType ?? "", bid: row.bid, ask: row.ask, intensity: row.intensity })) : trend.trades;
    const metrics = calculateTradeIntensityMetrics(trades);
    return { quote, intensity: { metrics, score: scoreTradeIntensity(metrics) }, intensityStatus: "OK" };
  } catch {
    return { quote, intensity: null, intensityStatus: "UNAVAILABLE" };
  }
}

function number(value: number | null, suffix = "") {
  return value == null ? "-" : `${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}${suffix}`;
}

export function formatTickerOverview(overview: TickerOverview | null) {
  if (!overview) return "해당 티커를 지원되는 미국 주식(NAS/NYS/AMS)에서 찾을 수 없습니다.";
  const { quote, intensity } = overview;
  const lines = [
    `📊 **${quote.ticker} | ${quote.name}**`, `${quote.market} · 현재가 **${number(quote.price)}** · **${number(quote.rate, "%")}**`,
    "", "**시세**", `시가 ${number(quote.open)} · 고가 ${number(quote.high)} · 저가 ${number(quote.low)}`,
    `거래량 ${number(quote.volume)} · 거래대금 ${number(quote.tradingValue)} · 시가총액 ${number(quote.marketCap)}`,
  ];
  if (intensity) {
    const m = intensity.metrics;
    lines.push("", "**최근 체결강도**", `최근 평균 ${number(m.recentAverageIntensity)} · 직전 대비 ${number(m.intensityChange)}`, `100 이상 비율 ${number(m.intensityAbove100Rate == null ? null : m.intensityAbove100Rate * 100, "%")} · 판정 **${intensity.score.level}**`);
  } else lines.push("", "체결강도: 데이터 부족");
  return lines.join("\n");
}
