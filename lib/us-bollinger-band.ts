import { getPool } from "@/lib/db";
import { loadFeatureModuleSettings } from "@/lib/feature-module-settings";
import type { UsDailyCandle } from "@/lib/kis-us-daily-price";
import { excludeCurrentUsMarketCandle } from "@/lib/us-market-date";
import { createUsDailyScanContext, type UsDailyScanContext } from "@/lib/us-daily-scan-context";

export const DEFAULT_BOLLINGER_PERIOD = 20;
export const DEFAULT_BOLLINGER_MULTIPLIER = 2;

export type UsBollingerPolicy = {
  period: number;
  stdDevMultiplier: number;
  minPrice: number;
  minVolume: number;
  minTurnoverRatio: number;
};

export type BollingerPoint = {
  date: string;
  close: number;
  middle: number;
  upper: number;
  lower: number;
  distanceToLowerPercent: number;
};

export type UsBollingerResult = {
  market: string;
  code: string;
  name: string;
  status: "QUALIFIED" | "NOT_TOUCHING" | "FILTERED" | "FAILED";
  qualifies: boolean;
  candleCount: number;
  latestCandleDate: string | null;
  close: number | null;
  volume: number | null;
  marketCap: number | null;
  turnoverRatio: number | null;
  band: BollingerPoint | null;
  filter: { minPrice: boolean; minVolume: boolean; minTurnoverRatio: boolean };
  error?: string;
};

export function calculateBollingerBands(candles: UsDailyCandle[], period = DEFAULT_BOLLINGER_PERIOD, stdDevMultiplier = DEFAULT_BOLLINGER_MULTIPLIER): BollingerPoint[] {
  if (!Number.isInteger(period) || period < 2) throw new Error("Bollinger period must be at least 2");
  if (!Number.isFinite(stdDevMultiplier) || stdDevMultiplier <= 0) throw new Error("Bollinger standard deviation multiplier must be positive");
  const rows = [...candles]
    .filter((candle) => Number.isFinite(candle.close) && candle.close > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  const points: BollingerPoint[] = [];
  for (let index = period - 1; index < rows.length; index += 1) {
    const window = rows.slice(index - period + 1, index + 1).map((candle) => candle.close);
    const middle = window.reduce((sum, value) => sum + value, 0) / period;
    const variance = window.reduce((sum, value) => sum + (value - middle) ** 2, 0) / period;
    const deviation = Math.sqrt(variance);
    const lower = middle - stdDevMultiplier * deviation;
    const upper = middle + stdDevMultiplier * deviation;
    const close = rows[index].close;
    points.push({
      date: rows[index].date,
      close,
      middle: Number(middle.toFixed(6)),
      upper: Number(upper.toFixed(6)),
      lower: Number(lower.toFixed(6)),
      distanceToLowerPercent: lower === 0 ? 0 : Number(((close - lower) / Math.abs(lower) * 100).toFixed(4)),
    });
  }
  return points;
}

export async function loadUsBollingerPolicy(): Promise<UsBollingerPolicy> {
  const settings = await loadFeatureModuleSettings("us-bollinger-band");
  const policy = settings.featureSettings?.bollingerPolicy as Partial<UsBollingerPolicy> | undefined;
  return {
    period: Math.max(2, Math.floor(Number(policy?.period ?? DEFAULT_BOLLINGER_PERIOD))),
    stdDevMultiplier: Math.max(0.1, Number(policy?.stdDevMultiplier ?? DEFAULT_BOLLINGER_MULTIPLIER)),
    minPrice: Math.max(0, Number(policy?.minPrice ?? 0)),
    minVolume: Math.max(0, Number(policy?.minVolume ?? 0)),
    minTurnoverRatio: Math.max(0, Number(policy?.minTurnoverRatio ?? 0)),
  };
}

async function loadTurnoverMetrics(items: Array<{ market: string; code: string }>) {
  const metrics = new Map<string, { marketCap: number | null; turnoverRatio: number | null }>();
  if (!items.length) return metrics;
  try {
    const result = await getPool().query<{ market: string; code: string; market_cap: number | null; turnover_ratio: number | null }>(
      `SELECT DISTINCT ON (market, code) market, code, market_cap, turnover_ratio
       FROM us_turnover_ratio_snapshots
       WHERE observed_at >= NOW() - INTERVAL '24 hours'
         AND (market, code) IN (${items.map((_, index) => `($${index * 2 + 1}, $${index * 2 + 2})`).join(",")})
       ORDER BY market, code, observed_at DESC`,
      items.flatMap((item) => [item.market.toUpperCase(), item.code.toUpperCase()]),
    );
    for (const row of result.rows) metrics.set(`${row.market.toUpperCase()}:${row.code.toUpperCase()}`, { marketCap: row.market_cap == null ? null : Number(row.market_cap), turnoverRatio: row.turnover_ratio == null ? null : Number(row.turnover_ratio) });
  } catch {
    // A missing turnover snapshot should be reported as a filter failure, not
    // cause the entire DB-backed diagnostic to abort.
  }
  return metrics;
}

export async function scanStoredUsBollingerBands(options: { policy?: Partial<UsBollingerPolicy>; concurrency?: number; context?: UsDailyScanContext } = {}) {
  const configured = options.policy ? { ...(await loadUsBollingerPolicy()), ...options.policy } : await loadUsBollingerPolicy();
  const policy: UsBollingerPolicy = {
    period: Math.max(2, Math.floor(Number(configured.period))),
    stdDevMultiplier: Math.max(0.1, Number(configured.stdDevMultiplier)),
    minPrice: Math.max(0, Number(configured.minPrice)),
    minVolume: Math.max(0, Number(configured.minVolume)),
    minTurnoverRatio: Math.max(0, Number(configured.minTurnoverRatio)),
  };
  const context = options.context ?? await createUsDailyScanContext({ candleLimit: Math.max(100, policy.period + 1) });
  const instruments = context.universe.scopes;
  const metrics = await loadTurnoverMetrics(instruments);
  const results: UsBollingerResult[] = [];
  const startedAt = Date.now();
  let cursor = 0;
  const concurrency = Math.max(1, Math.min(Math.floor(options.concurrency ?? 4), 8));
  async function worker() {
    while (true) {
      const instrument = instruments[cursor++];
      if (!instrument) return;
      const key = `${instrument.market}:${instrument.code}`;
      try {
        const candles = excludeCurrentUsMarketCandle(context.candles.get(key) ?? []);
        const points = calculateBollingerBands(candles, policy.period, policy.stdDevMultiplier);
        const latest = points.at(-1);
        const latestCandle = candles.find((candle) => candle.date === latest?.date);
        const metric = metrics.get(key);
        const close = latest?.close ?? null;
        const volume = latestCandle?.volume ?? null;
        const pricePass = close !== null && (policy.minPrice <= 0 || close >= policy.minPrice);
        const volumePass = volume !== null && (policy.minVolume <= 0 || volume >= policy.minVolume);
        const turnoverPass = policy.minTurnoverRatio <= 0 || (metric?.turnoverRatio != null && metric.turnoverRatio >= policy.minTurnoverRatio);
        const passesFilters = pricePass && volumePass && turnoverPass;
        const qualifies = Boolean(latest && passesFilters && latest.close <= latest.lower);
        const status = !latest ? "FAILED" : !passesFilters ? "FILTERED" : qualifies ? "QUALIFIED" : "NOT_TOUCHING";
        results.push({ market: instrument.market, code: instrument.code, name: instrument.name ?? "", status, qualifies, candleCount: candles.length, latestCandleDate: latest?.date ?? null, close, volume, marketCap: metric?.marketCap ?? null, turnoverRatio: metric?.turnoverRatio ?? null, band: latest ?? null, filter: { minPrice: pricePass, minVolume: volumePass, minTurnoverRatio: turnoverPass }, error: !latest ? `insufficient valid candles (${candles.length}/${policy.period})` : undefined });
      } catch (error) {
        results.push({ market: instrument.market, code: instrument.code, name: instrument.name ?? "", status: "FAILED", qualifies: false, candleCount: 0, latestCandleDate: null, close: null, volume: null, marketCap: null, turnoverRatio: null, band: null, filter: { minPrice: false, minVolume: false, minTurnoverRatio: false }, error: error instanceof Error ? error.message : String(error) });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, instruments.length)) }, worker));
  results.sort((a, b) => Number(b.qualifies) - Number(a.qualifies) || a.market.localeCompare(b.market) || a.code.localeCompare(b.code));
  return {
    ok: Boolean((context.universe.universe as any).ok),
    checkedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    universeAvailable: Boolean((context.universe.universe as any).ok),
    universe: context.universe.universe,
    policy,
    dataPolicy: { source: "us_daily_price_candles", completedDailyCandleOnly: true, exclusionRule: "현재 미국 시장일 캔들은 제외", touchRule: "최근 완료 일봉 종가 <= 하단선" },
    instrumentCount: instruments.length,
    successCount: results.filter((result) => result.status !== "FAILED").length,
    failureCount: results.filter((result) => result.status === "FAILED").length,
    filterExcludedCount: results.filter((result) => result.status === "FILTERED").length,
    qualified: results.filter((result) => result.qualifies),
    results,
  };
}
