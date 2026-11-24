import { getPool } from "@/lib/db";
import { fetchUsDailyPrice } from "@/lib/kis-us-daily-price";
import { EXCLUDED_US_OFFICIAL_NAME } from "@/lib/us-top-rising-universe";
import { validDailyCandleSql } from "@/lib/candle-sql-quality";

const MARKETS = ["NAS", "NYS", "AMS"] as const;

export type UsDailyMarketFreshness = {
  market: string;
  sourceLatestCandleDate: string;
  cacheLatestCandleDate: string | null;
  eligibleCount: number;
  atSourceLatestDateCount: number;
  missingAtSourceLatestDateCount: number;
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
  coverageByMarket: Map<string, { eligibleCount: number; atSourceLatestDateCount: number }>,
): UsDailyMarketFreshness[] {
  for (const market of MARKETS) {
    if (!sourceByMarket.get(market)) throw new Error(`US_DAILY_FRESHNESS_SOURCE_UNAVAILABLE:${market}`);
  }
  return MARKETS.map((market) => {
    const sourceLatestCandleDate = sourceByMarket.get(market);
    if (!sourceLatestCandleDate) throw new Error(`US_DAILY_FRESHNESS_SOURCE_UNAVAILABLE:${market}`);
    const cacheLatestCandleDate = cacheByMarket.get(market) ?? null;
    const coverage = coverageByMarket.get(market);
    if (!coverage) throw new Error(`US_DAILY_FRESHNESS_COVERAGE_UNAVAILABLE:${market}`);
    const missingAtSourceLatestDateCount = Math.max(0, coverage.eligibleCount - coverage.atSourceLatestDateCount);
    return {
      market,
      sourceLatestCandleDate,
      cacheLatestCandleDate,
      ...coverage,
      missingAtSourceLatestDateCount,
      stale: cacheLatestCandleDate === null || cacheLatestCandleDate < sourceLatestCandleDate || missingAtSourceLatestDateCount > 0,
    };
  });
}

/**
 * Outside the configured KST window, compare official source dates with both
 * the cache maximum and per-symbol coverage at that date. A market MAX alone
 * cannot prove that every active common stock received its latest candle.
 */
export async function detectUsDailyCacheLag(): Promise<UsDailyMarketFreshness[]> {
  const pool = getPool();
  const [candidateResult, cacheResult] = await Promise.all([
    pool.query<{ market: string; code: string }>(
      `SELECT market, code
         FROM (
           SELECT u.market, u.code,
                  ROW_NUMBER() OVER (PARTITION BY u.market ORDER BY c.volume DESC, u.code) AS rn
             FROM us_common_stock_universe u
             JOIN us_latest_daily_candles c ON c.market = u.market AND c.code = u.code
            WHERE u.enabled = true
              AND u.daily_active = true
              AND u.instrument_type = 'COMMON_STOCK'
              AND COALESCE(u.is_etf, false) = false
              AND COALESCE(u.is_warrant, false) = false
              AND COALESCE(u.is_derivative, false) = false
              AND COALESCE(u.is_dr, false) = false
              AND COALESCE(u.is_leveraged, false) = false
              AND COALESCE(u.is_inverse, false) = false
              AND NOT (COALESCE(u.name, '') || ' ' || COALESCE(u.english_name, '') ~* '${EXCLUDED_US_OFFICIAL_NAME.source}')
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
      if (date) {
        latestDate = date;
        break;
      }
    }
    if (!latestDate) throw new Error(`US_DAILY_FRESHNESS_PROBE_FAILED:${market}`);
    sourceByMarket.set(market, latestDate);
  }));

  const cacheByMarket = new Map<string, string>();
  for (const row of cacheResult.rows) {
    if (row.latest_date) cacheByMarket.set(row.market, row.latest_date);
  }
  const coverageResult = await pool.query<{ market: string; eligible_count: number | string; at_source_latest_date_count: number | string }>(
    `SELECT u.market,
            COUNT(*) AS eligible_count,
            COUNT(*) FILTER (
              WHERE c.candle_date = CASE u.market
                WHEN 'NAS' THEN $1::text
                WHEN 'NYS' THEN $2::text
                WHEN 'AMS' THEN $3::text
              END
                AND ${validDailyCandleSql("c")}
            ) AS at_source_latest_date_count
       FROM us_common_stock_universe u
       LEFT JOIN us_latest_daily_candles c ON c.market = u.market AND c.code = u.code
      WHERE u.enabled = true
        AND u.daily_active = true
        AND u.instrument_type = 'COMMON_STOCK'
        AND COALESCE(u.is_etf, false) = false
        AND COALESCE(u.is_warrant, false) = false
        AND COALESCE(u.is_derivative, false) = false
        AND COALESCE(u.is_dr, false) = false
        AND COALESCE(u.is_leveraged, false) = false
        AND COALESCE(u.is_inverse, false) = false
        AND NOT (COALESCE(u.name, '') || ' ' || COALESCE(u.english_name, '') ~* '${EXCLUDED_US_OFFICIAL_NAME.source}')
        AND u.market IN ('NAS', 'NYS', 'AMS')
      GROUP BY u.market`,
    [sourceByMarket.get("NAS"), sourceByMarket.get("NYS"), sourceByMarket.get("AMS")],
  );
  const coverageByMarket = new Map(coverageResult.rows.map((row) => [row.market, {
    eligibleCount: Number(row.eligible_count),
    atSourceLatestDateCount: Number(row.at_source_latest_date_count),
  }]));
  return compareUsDailyMarketFreshness(sourceByMarket, cacheByMarket, coverageByMarket);
}
