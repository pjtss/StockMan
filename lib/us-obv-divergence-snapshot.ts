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
const MIN_EVALUATED_COVERAGE = 0.7;
const PARTIAL_RETRY_COOLDOWN_MS = 30 * 60 * 1_000;
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
  market: string;
  code: string;
  name: string;
  candle_date: string | Date | null;
  open: number | string | null;
  high: number | string | null;
  low: number | string | null;
  close: number | string | null;
  volume: number | string | null;
  fetched_at: Date | string | null;
};

type StoredSnapshot = { as_of_date: string; generated_at: Date | string; payload: unknown };

function parseTimestamp(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

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

function easternClock(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", weekday: "short", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    weekday: values.weekday,
    date: `${values.year}-${values.month}-${values.day}`,
    minutes: Number(values.hour) * 60 + Number(values.minute),
  };
}

export type RefreshResult = {
  ok: true;
  skipped?: true;
  reason?: string;
  asOfEtDate?: string;
  scanStatus?: "COMPLETE" | "PARTIAL";
  universe?: Record<string, unknown>;
  candidateCount?: number;
  instrumentCount?: number;
  failureCount?: number;
};

export async function refreshUsObvDivergenceSnapshot(now = new Date()): Promise<RefreshResult> {
  const clock = easternClock(now);
  if (["Sat", "Sun"].includes(clock.weekday)) return { ok: true, skipped: true, reason: "US_MARKET_WEEKEND" };
  if (clock.minutes < 18 * 60 + 10) return { ok: true, skipped: true, reason: "BEFORE_DAILY_DATA_SETTLEMENT_WINDOW" };

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const lock = await client.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_xact_lock(hashtext('us-obv-divergence-snapshot')) AS locked",
    );
    if (!lock.rows[0]?.locked) {
      await client.query("ROLLBACK");
      return { ok: true, skipped: true, reason: "REFRESH_ALREADY_RUNNING" };
    }

    const latestDateResult = await client.query<{ latest_date: Date | string | null }>(
      `SELECT MAX(${CANONICAL_CANDLE_DATE}) AS latest_date
         FROM us_common_stock_universe u
         JOIN us_instrument_universe_candles c ON c.market = u.market AND c.code = u.code
        WHERE ${UNIVERSE_FILTER} AND c.timeframe = 'D'
          AND ${CANONICAL_CANDLE_DATE} <= $1::date`,
      [clock.date],
    );
    const asOfEtDate = isoDate(latestDateResult.rows[0]?.latest_date ?? null);
    if (!asOfEtDate) throw new Error("NO_COMPLETED_US_DAILY_CANDLES");

    const previous = await client.query<StoredSnapshot>(
      "SELECT as_of_date, generated_at, payload FROM us_obv_divergence_snapshot WHERE singleton = true FOR UPDATE",
    );
    const previousRow = previous.rows[0];
    if (previousRow) {
      const previousDate = isoDate(previousRow.as_of_date);
      const previousPayload = previousRow.payload as { scanStatus?: string } | null;
      const previousGeneratedAt = parseTimestamp(previousRow.generated_at).getTime();
      if (previousDate && previousDate >= asOfEtDate && previousPayload?.scanStatus === "COMPLETE") {
        await client.query("COMMIT");
        return { ok: true, skipped: true, reason: "SNAPSHOT_ALREADY_CURRENT", asOfEtDate };
      }
      if (previousDate === asOfEtDate && previousPayload?.scanStatus === "PARTIAL"
        && Number.isFinite(previousGeneratedAt) && now.getTime() - previousGeneratedAt < PARTIAL_RETRY_COOLDOWN_MS) {
        await client.query("COMMIT");
        return { ok: true, skipped: true, reason: "PARTIAL_SNAPSHOT_RETRY_COOLDOWN", asOfEtDate };
      }
    }

    const universeResult = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM us_common_stock_universe u WHERE ${UNIVERSE_FILTER}`,
    );
    const universeCount = Number(universeResult.rows[0]?.count ?? 0);
    if (!Number.isSafeInteger(universeCount) || universeCount < MIN_UNIVERSE_SIZE) throw new Error(`OFFICIAL_COMMON_STOCK_UNIVERSE_TOO_SMALL:${universeCount}`);

    const candlesResult = await client.query<CandleRow>(
      `SELECT u.market, u.code, u.name, selected.candle_date, selected.open, selected.high,
              selected.low, selected.close, selected.volume, selected.fetched_at
         FROM us_common_stock_universe u
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
      [asOfEtDate],
    );

    const instruments = new Map<string, { market: string; code: string; name: string; bars: ObvCandle[]; metadata: Array<{ candleDate: string; dataUpdatedAtUtc: string | null }>; invalidDate: boolean; conflict: boolean }>();
    for (const row of candlesResult.rows) {
      const key = `${row.market}:${row.code}`;
      let item = instruments.get(key);
      if (!item) {
        item = { market: row.market, code: row.code, name: row.name, bars: [], metadata: [], invalidDate: false, conflict: false };
        instruments.set(key, item);
      }
      if (row.candle_date == null) continue;
      const candleDate = isoDate(row.candle_date);
      if (!candleDate) { item.invalidDate = true; continue; }
      const open = numberOrNull(row.open);
      const high = numberOrNull(row.high);
      const low = numberOrNull(row.low);
      const close = numberOrNull(row.close);
      const volume = numberOrNull(row.volume);
      const candle: ObvCandle = close == null || volume == null
        ? { date: candleDate, open, high, low, close: Number.NaN, volume: Number.NaN }
        : { date: candleDate, open, high, low, close, volume };
      const existingIndex = item.bars.findIndex((value) => value.date === candleDate);
      const dataUpdatedAtUtc = row.fetched_at ? parseTimestamp(row.fetched_at).toISOString() : null;
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
      if (item.invalidDate) {
        reasons.INVALID_CANDLE_DATE = (reasons.INVALID_CANDLE_DATE ?? 0) + 1;
        continue;
      }
      if (item.conflict) {
        reasons.CONFLICTING_DUPLICATE_DATE = (reasons.CONFLICTING_DUPLICATE_DATE ?? 0) + 1;
        continue;
      }
      const result = evaluateUsObvDivergence(item.bars, item, asOfEtDate);
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

    const generatedAtUtc = now.toISOString();
    const scanStatus = missingOrInvalidCount === 0 ? "COMPLETE" : "PARTIAL";
    const payload = {
      schemaVersion: "us-obv-divergence.v4",
      algoVersion: US_OBV_DIVERGENCE_VERSION,
      generatedAtUtc,
      asOfEtDate,
      market: "US",
      securityClass: "ACTIVE_COMMON_STOCK_FROM_STOCKMAN_OFFICIAL_MASTER",
      marketCapLimitUsd: null,
      timeframe: "D",
      scanStatus,
      tradeEligibility: "WATCH_ONLY",
      universe: {
        source: "us_common_stock_universe",
        eligibleCommonStockCount: universeCount,
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

    await client.query(
      `INSERT INTO us_obv_divergence_snapshot (singleton, as_of_date, generated_at, scan_status, universe_count, evaluated_count, payload)
       VALUES (true, $1::date, $2::timestamptz, $3, $4, $5, $6::jsonb)
       ON CONFLICT (singleton) DO UPDATE SET as_of_date = EXCLUDED.as_of_date,
         generated_at = EXCLUDED.generated_at, scan_status = EXCLUDED.scan_status,
         universe_count = EXCLUDED.universe_count, evaluated_count = EXCLUDED.evaluated_count,
         payload = EXCLUDED.payload`,
      [asOfEtDate, generatedAtUtc, scanStatus, universeCount, evaluatedCount, JSON.stringify(payload)],
    );
    await client.query("COMMIT");
    return { ok: true, asOfEtDate, scanStatus, universe: payload.universe, candidateCount: candidates.length,
      instrumentCount: universeCount, failureCount: missingOrInvalidCount };
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* transaction may already be closed */ }
    throw error;
  } finally {
    client.release();
  }
}
