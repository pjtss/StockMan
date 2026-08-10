import { loadUsTurnoverFilterSettings } from "@/lib/us-turnover-settings";
import { getPool } from "@/lib/db";

export async function filterUsDailyCandidates<T extends Record<string, any>>(items: T[]) {
  const settings = await loadUsTurnoverFilterSettings();
  const pool = getPool();
  const metrics = new Map<string, {
    marketCap: number | null;
    turnoverRatio: number | null;
    tradingValue: number | null;
    price: number | null;
    changeRate: number | null;
  }>();
  if (pool && items.length) {
    const keys = items.map((item) => `${String(item.market || "").toUpperCase()}:${String(item.code || "").toUpperCase()}`);
    const result = await pool.query(`SELECT DISTINCT ON (market, code) market, code, market_cap, turnover_ratio, trading_value, price, change_rate FROM us_turnover_ratio_snapshots WHERE observed_at >= NOW() - INTERVAL '24 hours' AND (market, code) IN (${items.map((_, index) => `($${index * 2 + 1}, $${index * 2 + 2})`).join(",")}) ORDER BY market, code, observed_at DESC`, items.flatMap((item) => [String(item.market || "").toUpperCase(), String(item.code || "").toUpperCase()]));
    for (const row of result.rows) metrics.set(`${String(row.market).toUpperCase()}:${String(row.code).toUpperCase()}`, {
      marketCap: row.market_cap == null ? null : Number(row.market_cap),
      turnoverRatio: row.turnover_ratio == null ? null : Number(row.turnover_ratio),
      tradingValue: row.trading_value == null ? null : Number(row.trading_value),
      price: row.price == null ? null : Number(row.price),
      changeRate: row.change_rate == null ? null : Number(row.change_rate),
    });
    void keys;
  }
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
    const rawTurnover = item.turnoverRatio ?? metric?.turnoverRatio;
    const marketCap = rawMarketCap == null ? Number.NaN : Number(rawMarketCap);
    const turnover = rawTurnover == null ? Number.NaN : Number(rawTurnover);
    if (settings.maxPrice > 0 && !Number.isFinite(price)) return reject("missing_price");
    if (Number.isFinite(price) && price > settings.maxPrice) return reject("max_price");
    if (settings.maxRate > 0 && !Number.isFinite(rate)) return reject("missing_rate");
    if (Number.isFinite(rate) && rate > settings.maxRate) return reject("max_rate");
    const commonMinMarketCap = settings.globalMinMarketCap > 0 ? settings.globalMinMarketCap : 0;
    const commonMaxMarketCap = settings.globalMaxMarketCap > 0 ? settings.globalMaxMarketCap : 0;
    if ((commonMinMarketCap > 0 || commonMaxMarketCap > 0) && !Number.isFinite(marketCap)) return reject("missing_market_cap");
    if (Number.isFinite(marketCap) && ((commonMinMarketCap > 0 && marketCap < commonMinMarketCap) || (commonMaxMarketCap > 0 && marketCap > commonMaxMarketCap))) return reject("common_market_cap_range");
    if (settings.minTurnoverRatio > 0 && !Number.isFinite(turnover)) return reject("missing_turnover_ratio");
    if (Number.isFinite(turnover) && (turnover < settings.minTurnoverRatio || turnover > settings.maxTurnoverRatio)) return reject("turnover_ratio_range");
    return true;
  });
  return { filtered, settings, excludedCount: items.length - filtered.length, failureReasons, matchedMetricCount };
}
