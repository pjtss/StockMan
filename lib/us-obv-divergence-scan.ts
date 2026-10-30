import type { PoolClient } from "pg";
import { getPool } from "@/lib/db";
import {
  evaluateUsObvDivergence,
  normalizeCandleDate,
  US_OBV_DIVERGENCE_PARAMETERS,
  US_OBV_DIVERGENCE_VERSION,
  type ObvCandle,
  type ObvCandidate,
} from "@/lib/us-obv-divergence";

const MIN_UNIVERSE_SIZE = 1_500;
const MIN_MARKET_CAP_UNIVERSE_SIZE = 1_000;
const MARKET_CAP_LIMIT_USD = 100_000_000;
const MIN_EVALUATED_COVERAGE = 0.7;
const EVALUATED_NO_SIGNAL = new Set([
  "NO_20D_PRICE_DOWN_OBV_UP", "NO_CONFIRMED_DIVERGENCE", "LOW_DOLLAR_LIQUIDITY",
  "VOLUME_ACTIVITY_COLLAPSED", "ZERO_AVERAGE_VOLUME", "ZERO_VOLUME_OR_SUSPENDED",
  "POSSIBLE_SPLIT_OR_UNADJUSTED_CORPORATE_ACTION",
]);
const UNIVERSE_FILTER = `u.enabled = true
  AND u.daily_active = true
  AND u.instrument_type = 'COMMON_STOCK'
  AND COALESCE(u.is_etf, false) = false
  AND COALESCE(u.is_warrant, false) = false
  AND COALESCE(u.is_derivative, false) = false
  AND COALESCE(u.is_dr, false) = false
  AND COALESCE(u.is_leveraged, false) = false
  AND COALESCE(u.is_inverse, false) = false
  AND u.market IN ('NAS', 'NYS', 'AMS')`;
const CANONICAL_CANDLE_DATE = `CASE WHEN c.candle_date ~ '^\\d{8}$'
  THEN to_date(c.candle_date, 'YYYYMMDD')
  ELSE c.candle_date::date END`;

type CandleRow = {
  market: string; code: string; name: string; candle_date: string | Date | null;
  open: number | string | null; high: number | string | null; low: number | string | null;
  close: number | string | null; volume: number | string | null; fetched_at: Date | string | null;
};

export type UsObvDivergenceScanPayload = {
  schemaVersion: "us-obv-divergence.v4";
  algoVersion: string;
  generatedAtUtc: string;
  asOfEtDate: string;
  market: "US";
  securityClass: string;
  marketCapLimitUsd: typeof MARKET_CAP_LIMIT_USD;
  timeframe: "D";
  scanStatus: "COMPLETE" | "PARTIAL";
  tradeEligibility: "WATCH_ONLY";
  universe: {
    source: string; eligibleCommonStockCount: number; evaluatedCount: number;
    missingOrInvalidCount: number; evaluatedCoveragePct: number; candidateCount: number;
    officialCommonStockCount: number; validUsdMarketCapCount: number; marketCapCoveragePct: number;
    missingMarketCapCount: number;
    excludedReasons: Record<string, number>;
  };
  parameters: typeof US_OBV_DIVERGENCE_PARAMETERS;
  warnings: string[];
  pagination: { page: 1; pageSize: number; totalItems: number; totalPages: number };
  items: ObvCandidate[];
};

function numberOrNull(value: number | string | null): number | null {
  if (value == null) return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function isoDate(value: string | Date | null): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return normalizeCandleDate(value);
}

export async function findLatestCompletedUsDailyDate(client: PoolClient, dateLimit: string) {
  const result = await client.query<{ latest_date: Date | string | null }>(
    `SELECT MAX(${CANONICAL_CANDLE_DATE}) AS latest_date
       FROM us_common_stock_universe u
       JOIN us_instrument_universe_candles c ON c.market = u.market AND c.code = u.code
      WHERE ${UNIVERSE_FILTER} AND c.timeframe = 'D' AND ${CANONICAL_CANDLE_DATE} <= $1::date`,
    [dateLimit],
  );
  return isoDate(result.rows[0]?.latest_date ?? null);
}

/** Shared scanner used by both the persisted daily snapshot and direct webhook requests. */
export async function scanUsObvDivergenceWithClient(
  client: PoolClient,
  asOfEtDate: string,
  now = new Date(),
): Promise<UsObvDivergenceScanPayload> {
  const universeResult = await client.query<{
    official_count: string; valid_us_market_cap_count: string; eligible_count: string;
  }>(
    `SELECT COUNT(*)::text AS official_count,
            COUNT(*) FILTER (WHERE f.currency = 'USD' AND f.market_cap > 0 AND f.market_cap < 'Infinity'::double precision)::text AS valid_us_market_cap_count,
            COUNT(*) FILTER (WHERE f.currency = 'USD' AND f.market_cap > 0 AND f.market_cap <= $1)::text AS eligible_count
       FROM us_common_stock_universe u
       LEFT JOIN LATERAL (
         SELECT market_cap, currency FROM instrument_fundamental_snapshots f
          WHERE f.market = u.market AND f.code = u.code
          ORDER BY f.observed_at DESC NULLS LAST, f.fetched_at DESC NULLS LAST LIMIT 1
       ) f ON true
      WHERE ${UNIVERSE_FILTER}`,
    [MARKET_CAP_LIMIT_USD],
  );
  const officialUniverseCount = Number(universeResult.rows[0]?.official_count ?? 0);
  const validUsdMarketCapCount = Number(universeResult.rows[0]?.valid_us_market_cap_count ?? 0);
  const universeCount = Number(universeResult.rows[0]?.eligible_count ?? 0);
  if (!Number.isSafeInteger(officialUniverseCount) || officialUniverseCount < MIN_UNIVERSE_SIZE) {
    throw new Error(`OFFICIAL_COMMON_STOCK_UNIVERSE_TOO_SMALL:${officialUniverseCount}`);
  }
  if (!Number.isSafeInteger(universeCount) || universeCount < MIN_MARKET_CAP_UNIVERSE_SIZE) {
    throw new Error(`USD_UNDER_100M_UNIVERSE_TOO_SMALL:${universeCount}`);
  }
  const marketCapCoverage = validUsdMarketCapCount / officialUniverseCount;
  if (marketCapCoverage < MIN_EVALUATED_COVERAGE) {
    throw new Error(`LOW_MARKET_CAP_COVERAGE:${marketCapCoverage.toFixed(4)}:${validUsdMarketCapCount}/${officialUniverseCount}`);
  }

  const candlesResult = await client.query<CandleRow & { market_cap_usd: number | string; market_cap_observed_at: Date | string | null }>(
    `SELECT u.market, u.code, u.name, f.market_cap AS market_cap_usd, f.observed_at AS market_cap_observed_at,
            selected.candle_date, selected.open, selected.high,
            selected.low, selected.close, selected.volume, selected.fetched_at
       FROM us_common_stock_universe u
       JOIN LATERAL (
         SELECT market_cap, currency, observed_at FROM instrument_fundamental_snapshots f
          WHERE f.market = u.market AND f.code = u.code
          ORDER BY f.observed_at DESC NULLS LAST, f.fetched_at DESC NULLS LAST LIMIT 1
       ) f ON f.currency = 'USD' AND f.market_cap > 0 AND f.market_cap <= $2
       LEFT JOIN LATERAL (
         SELECT c.candle_date, c.open, c.high, c.low, c.close, c.volume, c.fetched_at
           FROM us_instrument_universe_candles c
          WHERE c.market = u.market AND c.code = u.code AND c.timeframe = 'D'
            AND (CASE WHEN c.candle_date ~ '^\\d{8}$'
                  THEN to_date(c.candle_date, 'YYYYMMDD') ELSE c.candle_date::date END) <= $1::date
          ORDER BY CASE WHEN c.candle_date ~ '^\\d{8}$'
                  THEN to_date(c.candle_date, 'YYYYMMDD') ELSE c.candle_date::date END DESC,
                   c.fetched_at DESC
          LIMIT 160
       ) selected ON true
      WHERE ${UNIVERSE_FILTER}
      ORDER BY u.market, u.code,
        CASE WHEN selected.candle_date ~ '^\\d{8}$'
             THEN to_date(selected.candle_date, 'YYYYMMDD') ELSE selected.candle_date::date END`,
    [asOfEtDate, MARKET_CAP_LIMIT_USD],
  );

  const instruments = new Map<string, {
    market: string; code: string; name: string; marketCapUsd: number; marketCapObservedAtUtc: string | null; bars: ObvCandle[];
    metadata: Array<{ candleDate: string; dataUpdatedAtUtc: string | null }>;
    invalidDate: boolean; conflict: boolean;
  }>();
  for (const row of candlesResult.rows) {
    const key = `${row.market}:${row.code}`;
    let item = instruments.get(key);
    if (!item) {
      item = { market: row.market, code: row.code, name: row.name, marketCapUsd: Number(row.market_cap_usd), marketCapObservedAtUtc: row.market_cap_observed_at ? new Date(row.market_cap_observed_at).toISOString() : null, bars: [], metadata: [], invalidDate: false, conflict: false };
      instruments.set(key, item);
    }
    if (row.candle_date == null) continue;
    const candleDate = isoDate(row.candle_date);
    if (!candleDate) { item.invalidDate = true; continue; }
    const open = numberOrNull(row.open), high = numberOrNull(row.high), low = numberOrNull(row.low);
    const close = numberOrNull(row.close), volume = numberOrNull(row.volume);
    const candle: ObvCandle = close == null || volume == null
      ? { date: candleDate, open, high, low, close: Number.NaN, volume: Number.NaN }
      : { date: candleDate, open, high, low, close, volume };
    const existingIndex = item.bars.findIndex((value) => value.date === candleDate);
    const dataUpdatedAtUtc = row.fetched_at ? new Date(row.fetched_at).toISOString() : null;
    if (existingIndex >= 0) {
      const existing = item.bars[existingIndex];
      if (["open", "high", "low", "close", "volume"].some((key) => existing[key as keyof ObvCandle] !== candle[key as keyof ObvCandle])) {
        item.conflict = true;
      } else if (dataUpdatedAtUtc && (!item.metadata[existingIndex].dataUpdatedAtUtc || dataUpdatedAtUtc > item.metadata[existingIndex].dataUpdatedAtUtc!)) {
        item.metadata[existingIndex] = { candleDate, dataUpdatedAtUtc };
      }
      continue;
    }
    item.bars.push(candle);
    item.metadata.push({ candleDate, dataUpdatedAtUtc });
  }

  const reasons: Record<string, number> = {};
  const candidates: ObvCandidate[] = [];
  let evaluatedCount = 0;
  for (const item of instruments.values()) {
    if (item.invalidDate) { reasons.INVALID_CANDLE_DATE = (reasons.INVALID_CANDLE_DATE ?? 0) + 1; continue; }
    if (item.conflict) { reasons.CONFLICTING_DUPLICATE_DATE = (reasons.CONFLICTING_DUPLICATE_DATE ?? 0) + 1; continue; }
    const result = evaluateUsObvDivergence(item.bars, {
      market: item.market, code: item.code, name: item.name,
      marketCapUsd: item.marketCapUsd, marketCapObservedAtUtc: item.marketCapObservedAtUtc,
    }, asOfEtDate);
    if (result.candidate) {
      evaluatedCount += 1;
      result.candidate.candleMetadata = item.metadata.slice(-160);
      candidates.push(result.candidate);
    } else {
      const reason = result.reason ?? "UNKNOWN_EXCLUSION";
      reasons[reason] = (reasons[reason] ?? 0) + 1;
      if (EVALUATED_NO_SIGNAL.has(reason)) evaluatedCount += 1;
    }
  }

  const missingOrInvalidCount = Math.max(0, universeCount - evaluatedCount);
  const coverage = universeCount ? evaluatedCount / universeCount : 0;
  if (coverage < MIN_EVALUATED_COVERAGE) throw new Error(`LOW_DATA_COVERAGE:${coverage.toFixed(4)}:${evaluatedCount}/${universeCount}`);
  candidates.sort((a, b) => Number(b.signalType === "BOTH") - Number(a.signalType === "BOTH")
    || Number(b.signalQuality === "HIGH") - Number(a.signalQuality === "HIGH")
    || Number(a.dataIssues.length > 0) - Number(b.dataIssues.length > 0)
    || (b.pivotObvNormalized ?? 0) - (a.pivotObvNormalized ?? 0)
    || b.avgDollarVolume20d - a.avgDollarVolume20d
    || a.ticker.localeCompare(b.ticker));

  const scanStatus = missingOrInvalidCount === 0 ? "COMPLETE" : "PARTIAL";
  return {
    schemaVersion: "us-obv-divergence.v4",
    algoVersion: US_OBV_DIVERGENCE_VERSION,
    generatedAtUtc: now.toISOString(),
    asOfEtDate,
    market: "US",
    securityClass: "ACTIVE_COMMON_STOCK_FROM_STOCKMAN_OFFICIAL_MASTER",
    marketCapLimitUsd: MARKET_CAP_LIMIT_USD,
    timeframe: "D",
    scanStatus,
    tradeEligibility: "WATCH_ONLY",
    universe: {
      source: "us_common_stock_universe",
      eligibleCommonStockCount: universeCount,
      officialCommonStockCount: officialUniverseCount,
      validUsdMarketCapCount,
      marketCapCoveragePct: Number((marketCapCoverage * 100).toFixed(3)),
      missingMarketCapCount: Math.max(0, officialUniverseCount - validUsdMarketCapCount),
      evaluatedCount,
      missingOrInvalidCount,
      evaluatedCoveragePct: Number((coverage * 100).toFixed(3)),
      candidateCount: candidates.length,
      excludedReasons: reasons,
    },
    parameters: US_OBV_DIVERGENCE_PARAMETERS,
    warnings: [
      "TECHNICAL_SCREEN_ONLY_NOT_A_BUY_SIGNAL",
      "PRICE_AND_VOLUME_CORPORATE_ACTION_ADJUSTMENTS_NOT_INDEPENDENTLY_VERIFIED",
      ...(scanStatus === "PARTIAL" ? ["PARTIAL_OHLCV_COVERAGE"] : []),
    ],
    pagination: { page: 1, pageSize: candidates.length, totalItems: candidates.length, totalPages: candidates.length ? 1 : 0 },
    items: candidates,
  };
}

function easternClock(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", weekday: "short", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { weekday: values.weekday, date: `${values.year}-${values.month}-${values.day}`, minutes: Number(values.hour) * 60 + Number(values.minute) };
}

/** Runs the scan against a transactionally consistent local/operating DB read view without writing a snapshot. */
export async function scanUsObvDivergenceOnDemand(now = new Date()): Promise<UsObvDivergenceScanPayload> {
  const clock = easternClock(now);
  if (["Sat", "Sun"].includes(clock.weekday)) throw new Error("US_MARKET_WEEKEND");
  if (clock.minutes < 18 * 60 + 10) throw new Error("BEFORE_DAILY_DATA_SETTLEMENT_WINDOW");
  const client = await getPool().connect();
  try {
    await client.query("BEGIN READ ONLY");
    const asOfEtDate = await findLatestCompletedUsDailyDate(client, clock.date);
    if (!asOfEtDate) throw new Error("NO_COMPLETED_US_DAILY_CANDLES");
    const payload = await scanUsObvDivergenceWithClient(client, asOfEtDate, now);
    await client.query("ROLLBACK");
    return payload;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* transaction may already be closed */ }
    throw error;
  } finally {
    client.release();
  }
}
