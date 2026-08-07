import { loadUsTurnoverFilterSettings } from "@/lib/us-turnover-settings";
import { getPool } from "@/lib/db";

export async function filterUsDailyCandidates<T extends Record<string, any>>(items: T[]) {
  const settings = await loadUsTurnoverFilterSettings();
  const pool = getPool();
  const metrics = new Map<string, { marketCap: number | null; turnoverRatio: number | null; tradingValue: number | null }>();
  if (pool && items.length) {
    const keys = items.map((item) => `${String(item.market || "").toUpperCase()}:${String(item.code || "").toUpperCase()}`);
    const result = await pool.query(`SELECT DISTINCT ON (market, code) market, code, market_cap, turnover_ratio, trading_value FROM us_turnover_ratio_snapshots WHERE observed_at >= NOW() - INTERVAL '24 hours' AND (market, code) IN (${items.map((_, index) => `($${index * 2 + 1}, $${index * 2 + 2})`).join(",")}) ORDER BY market, code, observed_at DESC`, items.flatMap((item) => [String(item.market || "").toUpperCase(), String(item.code || "").toUpperCase()]));
    for (const row of result.rows) metrics.set(`${row.market}:${row.code}`, { marketCap: Number(row.market_cap), turnoverRatio: Number(row.turnover_ratio), tradingValue: Number(row.trading_value) });
    void keys;
  }
  const failureReasons: Record<string, number> = {};
  const filtered = items.filter((item) => {
    const reject = (reason: string) => { failureReasons[reason] = (failureReasons[reason] || 0) + 1; return false; };
    const price = Number(item.price ?? item.currentPrice);
    const rate = Number(item.rate ?? item.changeRate);
    const metric = metrics.get(`${String(item.market || "").toUpperCase()}:${String(item.code || "").toUpperCase()}`);
    const marketCap = Number(item.marketCap ?? metric?.marketCap);
    const turnover = Number(item.turnoverRatio ?? metric?.turnoverRatio);
    if (settings.maxPrice > 0 && !Number.isFinite(price)) return reject("missing_price");
    if (Number.isFinite(price) && price > settings.maxPrice) return reject("max_price");
    if (settings.maxRate > 0 && !Number.isFinite(rate)) return reject("missing_rate");
    if (Number.isFinite(rate) && rate > settings.maxRate) return reject("max_rate");
    if (settings.minMarketCap > 0 && !Number.isFinite(marketCap)) return reject("missing_market_cap");
    if (Number.isFinite(marketCap) && (marketCap < settings.minMarketCap || marketCap > settings.maxMarketCap)) return reject("market_cap_range");
    if (settings.minTurnoverRatio > 0 && !Number.isFinite(turnover)) return reject("missing_turnover_ratio");
    if (Number.isFinite(turnover) && (turnover < settings.minTurnoverRatio || turnover > settings.maxTurnoverRatio)) return reject("turnover_ratio_range");
    return true;
  });
  return { filtered, settings, excludedCount: items.length - filtered.length, failureReasons };
}
