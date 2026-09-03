import { calculateMarketCapTurnoverPercent, isGlobalMarketCapAllowed, isTurnoverRatioAllowed, loadUsTurnoverFilterSettings } from "@/lib/us-turnover-settings";

export async function filterUsDailyCandidates<T extends Record<string, any>>(items: T[]) {
  const settings = await loadUsTurnoverFilterSettings();
  const metrics = new Map<string, {
    marketCap: number | null;
    turnoverRatio: number | null;
    tradingValue: number | null;
    price: number | null;
    changeRate: number | null;
  }>();
  // Daily scanners are DB-candle based. Live snapshots are
  // not queried; callers may provide quote fields directly when needed.
  const matchedMetricCount = items.filter((item) => metrics.has(`${String(item.market || "").toUpperCase()}:${String(item.code || "").toUpperCase()}`)).length;
  const failureReasons: Record<string, number> = {};
  const filtered = items.filter((item) => {
    const reject = (reason: string) => { failureReasons[reason] = (failureReasons[reason] || 0) + 1; return false; };
    const metric = metrics.get(`${String(item.market || "").toUpperCase()}:${String(item.code || "").toUpperCase()}`);
    // Daily indicator scans intentionally use DB candles only and therefore do
    // not carry live quote fields. Reuse the latest turnover snapshot instead
    // of treating those fields as missing and rejecting every candidate.
    const price = Number(item.price ?? item.currentPrice ?? metric?.price);
    const rate = Number(item.rate ?? item.changeRate ?? metric?.changeRate);
    const rawMarketCap = item.marketCap ?? metric?.marketCap;
    const rawTurnover = item.turnoverRatio ?? metric?.turnoverRatio ?? calculateMarketCapTurnoverPercent(item.tradingValue ?? item.rankingTradeValue, rawMarketCap);
    const marketCap = rawMarketCap == null ? Number.NaN : Number(rawMarketCap);
    const turnover = rawTurnover == null ? Number.NaN : Number(rawTurnover);
    if (settings.maxPrice > 0 && !Number.isFinite(price)) return reject("missing_price");
    if (Number.isFinite(price) && price > settings.maxPrice) return reject("max_price");
    if (settings.maxRate > 0 && !Number.isFinite(rate)) return reject("missing_rate");
    if (Number.isFinite(rate) && rate > settings.maxRate) return reject("max_rate");
    if (!isGlobalMarketCapAllowed(marketCap, settings)) return reject(Number.isFinite(marketCap) ? "common_market_cap_range" : "missing_market_cap");
    if (!isTurnoverRatioAllowed(turnover, settings)) return reject(Number.isFinite(turnover) ? "turnover_ratio_range" : "missing_turnover_ratio");
    return true;
  });
  return { filtered, settings, excludedCount: items.length - filtered.length, failureReasons, matchedMetricCount };
}
