import { getPool } from "@/lib/db";
import { fetchUsDailyPrice } from "@/lib/kis-us-daily-price";
import { validDailyCandleSql } from "@/lib/candle-sql-quality";

const MARKETS = ["NAS", "NYS", "AMS"] as const;

export type UsDailyMarketFreshness = {
  market: string;
  sourceLatestCandleDate: string;
  cacheLatestCandleDate: string | null;
  stale: boolean;
};

export function isUsPostCloseWeekday(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const weekday = parts.find((part) => part.type === "weekday")?.value;
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  return ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(weekday ?? "") && hour >= 18;
}

export function compareUsDailyMarketFreshness(
  sourceByMarket: Map<string, string>,
  cacheByMarket: Map<string, string>,
): UsDailyMarketFreshness[] {
  return MARKETS.map((market) => {
    const sourceLatestCandleDate = sourceByMarket.get(market);
    if (!sourceLatestCandleDate) throw new Error(`US_DAILY_FRESHNESS_SOURCE_UNAVAILABLE:${market}`);
    const cacheLatestCandleDate = cacheByMarket.get(market) ?? null;
    return {
      market,
      sourceLatestCandleDate,
      cacheLatestCandleDate,
      stale: cacheLatestCandleDate === null || cacheLatestCandleDate < sourceLatestCandleDate,
    };
  });
}

/**
 * Outside the configured KST window, probe official active common stocks after
 * the New York close. If KIS has a newer daily candle than the operating cache,
 * the caller can safely start the normal full-universe warm job as a catch-up.
 */
export async function detectUsDailyCacheLag(): Promise<UsDailyMarketFreshness[]> {
  const pool = getPool();
  const [candidateResult, cacheResult] = await Promise.all([
    pool.query<{ market: string; code: string }>(
      `SELECT market, code
         FROM (
           SELECT u.market, u.code,
                  ROW_NUMBER() OVER (PARTITION BY u.market ORDER BY u.code) AS rn
             FROM us_common_stock_universe u
            WHERE u.enabled = true
              AND u.instrument_type = 'COMMON_STOCK'
              AND COALESCE(u.is_etf, false) = false
              AND COALESCE(u.is_warrant, false) = false
              AND COALESCE(u.is_derivative, false) = false
              AND COALESCE(u.is_dr, false) = false
              AND COALESCE(u.is_leveraged, false) = false
              AND COALESCE(u.is_inverse, false) = false
         ) candidates
        WHERE rn <= 3
        ORDER BY market, code`,
    ),
    pool.query<{ market: string; latest_date: string | null }>(
      `SELECT c.market, MAX(c.candle_date) AS latest_date
         FROM us_latest_daily_candles c
        WHERE ${validDailyCandleSql("c")}
        GROUP BY c.market`,
    ),
  ]);

  const candidatesByMarket = new Map<string, string[]>();
  for (const row of candidateResult.rows) {
    const codes = candidatesByMarket.get(row.market) ?? [];
    codes.push(row.code);
    candidatesByMarket.set(row.market, codes);
  }

  const sourceByMarket = new Map<string, string>();
  await Promise.all(MARKETS.map(async (market) => {
    const codes = candidatesByMarket.get(market) ?? [];
    if (!codes.length) throw new Error(`US_DAILY_FRESHNESS_ANCHOR_UNAVAILABLE:${market}`);
    let latestDate: string | null = null;
    for (const code of codes) {
      const response = await fetchUsDailyPrice({ code, market, timeframe: "D" });
      const date = response?.ok ? response.candles.reduce<string | null>((latest, candle) => !latest || candle.date > latest ? candle.date : latest, null) : null;
      if (date && (!latestDate || date > latestDate)) latestDate = date;
    }
    if (!latestDate) throw new Error(`US_DAILY_FRESHNESS_PROBE_FAILED:${market}`);
    sourceByMarket.set(market, latestDate);
  }));

  const cacheByMarket = new Map<string, string>();
  for (const row of cacheResult.rows) {
    if (row.latest_date) cacheByMarket.set(row.market, row.latest_date);
  }
  return compareUsDailyMarketFreshness(sourceByMarket, cacheByMarket);
}
