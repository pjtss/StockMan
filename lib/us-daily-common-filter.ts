import { loadUsTurnoverFilterSettings } from "@/lib/us-turnover-settings";

export async function filterUsDailyCandidates<T extends Record<string, any>>(items: T[]) {
  const settings = await loadUsTurnoverFilterSettings();
  const filtered = items.filter((item) => {
    const price = Number(item.price ?? item.currentPrice);
    const rate = Number(item.rate ?? item.changeRate);
    const marketCap = Number(item.marketCap);
    const turnover = Number(item.turnoverRatio);
    if (Number.isFinite(price) && price > settings.maxPrice) return false;
    if (Number.isFinite(rate) && rate > settings.maxRate) return false;
    if (Number.isFinite(marketCap) && (marketCap < settings.minMarketCap || marketCap > settings.maxMarketCap)) return false;
    if (Number.isFinite(turnover) && (turnover < settings.minTurnoverRatio || turnover > settings.maxTurnoverRatio)) return false;
    return true;
  });
  return { filtered, settings, excludedCount: items.length - filtered.length };
}
