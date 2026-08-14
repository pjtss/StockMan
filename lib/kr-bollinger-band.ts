import { loadFeatureModuleSettings } from "@/lib/feature-module-settings";
import { loadStoredKrInstrumentScopes } from "@/lib/kr-instruments";
import {
  loadCachedKrDailyCandlesBulk,
  loadKrMarketMetrics,
} from "@/lib/kr-daily-price-cache";
import type { OHLCVCandle } from "@/lib/kis-chart";
const RESULT_CACHE_TTL_MS = Math.max(0, Number(process.env.BOLLINGER_RESULT_CACHE_TTL_MS ?? 30000) || 30000);
const resultCache = new Map<string, { expiresAt: number; value: any }>();

export type KrBollingerPolicy = {
  timeframe?: "D" | "W" | "M";
  period: number;
  stdDevMultiplier: number;
  minPrice: number;
  minVolume: number;
  minTurnoverRatio: number;
};
export type KrBollingerResult = {
  market: string;
  code: string;
  name: string;
  status: "QUALIFIED_TOUCH" | "QUALIFIED_BELOW" | "NOT_TOUCHING" | "FILTERED" | "INSUFFICIENT_HISTORY" | "FAILED";
  qualifies: boolean;
  candleCount: number;
  latestCandleDate: string | null;
  close: number | null;
  low: number | null;
  volume: number | null;
  marketCap: number | null;
  turnoverRatio: number | null;
  band: {
    date: string;
    close: number;
    low: number;
    middle: number;
    upper: number;
    lower: number;
    distanceToLowerPercent: number;
  } | null;
  filter: { minPrice: boolean; minVolume: boolean; minTurnoverRatio: boolean };
  error?: string;
  touchState: "TOUCH" | "BELOW" | "NONE";
  reasonCode?: string;
};
const defaults: KrBollingerPolicy = {
  timeframe: "D",
  period: 20,
  stdDevMultiplier: 2,
  minPrice: 0,
  minVolume: 0,
  minTurnoverRatio: 0,
};
export async function loadKrBollingerPolicy() {
  const s = await loadFeatureModuleSettings("kr-bollinger-band");
  const p = (s.featureSettings?.krBollingerPolicy ??
    {}) as Partial<KrBollingerPolicy>;
  return {
    ...defaults,
    timeframe: p.timeframe === "W" || p.timeframe === "M" ? p.timeframe : "D",
    period: Math.max(2, Math.floor(Number(p.period ?? defaults.period))),
    stdDevMultiplier: Math.max(0.1, Number(p.stdDevMultiplier ?? 2)),
    minPrice: Math.max(0, Number(p.minPrice ?? 0)),
    minVolume: Math.max(0, Number(p.minVolume ?? 0)),
    minTurnoverRatio: Math.max(0, Number(p.minTurnoverRatio ?? 0)),
  };
}
export function calculateKrBollingerBands(
  candles: OHLCVCandle[],
  period = 20,
  multiplier = 2,
) {
  const rows = [...candles]
    .filter(
      (c) =>
        Number.isFinite(c.close) &&
        c.close > 0 &&
        Number.isFinite(c.low) &&
        c.low > 0,
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  const points: any[] = [];
  for (let i = period - 1; i < rows.length; i++) {
    const w = rows.slice(i - period + 1, i + 1).map((c) => c.close);
    const middle = w.reduce((a, b) => a + b, 0) / period;
    const dev = Math.sqrt(
      w.reduce((a, b) => a + (b - middle) ** 2, 0) / period,
    );
    const lower = middle - multiplier * dev;
    const upper = middle + multiplier * dev;
    const widthPercent = middle === 0 ? 0 : Number((((upper - lower) / Math.abs(middle)) * 100).toFixed(4));
    const previous = points.at(-1);
    points.push({
      date: rows[i].date,
      close: rows[i].close,
      low: rows[i].low,
      middle: Number(middle.toFixed(6)),
      upper: Number(upper.toFixed(6)),
      lower: Number(lower.toFixed(6)),
      distanceToLowerPercent:
        lower === 0
          ? 0
          : Number(
              (((rows[i].close - lower) / Math.abs(lower)) * 100).toFixed(4),
            ),
    });
    points[points.length - 1].widthPercent = widthPercent;
    points[points.length - 1].widthExpanding = previous ? widthPercent > previous.widthPercent : false;
  }
  return points;
}
export async function scanStoredKrBollingerBands(
  options: { policy?: Partial<KrBollingerPolicy> } = {},
) {
  const loaded = await loadKrBollingerPolicy();
  const overrides = options.policy ?? {};
  const policy = {
    timeframe: overrides.timeframe === "W" || overrides.timeframe === "M"
      ? overrides.timeframe
      : loaded.timeframe,
    period: Math.max(2, Math.floor(Number(overrides.period ?? loaded.period))),
    stdDevMultiplier: Math.max(
      0.1,
      Number(overrides.stdDevMultiplier ?? loaded.stdDevMultiplier),
    ),
    minPrice: Math.max(0, Number(overrides.minPrice ?? loaded.minPrice)),
    minVolume: Math.max(0, Number(overrides.minVolume ?? loaded.minVolume)),
    minTurnoverRatio: Math.max(
      0,
      Number(overrides.minTurnoverRatio ?? loaded.minTurnoverRatio),
    ),
  } as KrBollingerPolicy;
  const universe = await loadStoredKrInstrumentScopes();
  const timeframe = (policy.timeframe ?? "D") as "D" | "W" | "M";
  const cacheKey = JSON.stringify(policy);
  if (RESULT_CACHE_TTL_MS > 0) {
    const cached = resultCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return { ...cached.value, cacheHit: true };
  }
  const candles = await loadCachedKrDailyCandlesBulk(
    universe.scopes,
    Math.max(100, policy.period + 1),
    timeframe,
  );
  const metrics = await loadKrMarketMetrics(universe.scopes);
  const results: KrBollingerResult[] = [];
  for (const item of universe.scopes) {
    const key = `${item.market}:${item.code}`;
    try {
      const series = candles.get(key) ?? [];
      const points = calculateKrBollingerBands(
        series,
        policy.period,
        policy.stdDevMultiplier,
      );
      const band = points.length > 0 ? points[points.length - 1] : null;
      const latest = band
        ? (series.find((c) => c.date === band.date) ?? null)
        : null;
      const metric = metrics.get(key);
      const pricePass =
        band !== null &&
        (policy.minPrice <= 0 || band.close >= policy.minPrice);
      const volumePass =
        latest !== null &&
        (policy.minVolume <= 0 || latest.volume >= policy.minVolume);
      const turnoverPass =
        policy.minTurnoverRatio <= 0 ||
        (metric?.turnoverRatio != null &&
          metric.turnoverRatio >= policy.minTurnoverRatio);
      const passes = pricePass && volumePass && turnoverPass;
      const touchState = !band ? "NONE" : band.close < band.lower ? "BELOW" : band.close <= band.lower ? "TOUCH" : "NONE";
      const qualifies = Boolean(band && passes && touchState !== "NONE");
      results.push({
        market: item.market,
        code: item.code,
        name: item.name,
        status: !band
          ? "INSUFFICIENT_HISTORY"
          : !passes
            ? "FILTERED"
            : qualifies
              ? touchState === "BELOW" ? "QUALIFIED_BELOW" : "QUALIFIED_TOUCH"
              : "NOT_TOUCHING",
        qualifies,
        touchState,
        reasonCode: !band ? "INSUFFICIENT_HISTORY" : undefined,
        candleCount: series.length,
        latestCandleDate: band?.date ?? null,
        close: band?.close ?? null,
        low: band?.low ?? null,
        volume: latest?.volume ?? null,
        marketCap: metric?.marketCap ?? null,
        turnoverRatio: metric?.turnoverRatio ?? null,
        band,
        filter: {
          minPrice: pricePass,
          minVolume: volumePass,
          minTurnoverRatio: turnoverPass,
        },
        error: !band
          ? `insufficient valid candles (${series.length}/${policy.period})`
          : undefined,
      });
    } catch (e) {
      results.push({
        market: item.market,
        code: item.code,
        name: item.name,
        status: "FAILED",
        qualifies: false,
        touchState: "NONE",
        candleCount: 0,
        latestCandleDate: null,
        close: null,
        low: null,
        volume: null,
        marketCap: null,
        turnoverRatio: null,
        band: null,
        filter: { minPrice: false, minVolume: false, minTurnoverRatio: false },
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  const output = {
    ok: true,
    checkedAt: new Date().toISOString(),
    universeAvailable: true,
    universe: universe.universe,
    policy,
    dataPolicy: {
      source: "kr_daily_price_candles",
      timeframe,
      bandCalculation: "종가 기반",
      touchRule: "최근 저장 봉 종가 = TOUCH, 하단선 미만 = BELOW",
      currentDayExcluded: false,
    },
    instrumentCount: universe.scopes.length,
    successCount: results.filter((r) => r.status !== "FAILED" && r.status !== "INSUFFICIENT_HISTORY").length,
    failureCount: results.filter((r) => r.status === "FAILED" || r.status === "INSUFFICIENT_HISTORY").length,
    statistics: {
      qualifiedTouch: results.filter((r) => r.status === "QUALIFIED_TOUCH").length,
      qualifiedBelow: results.filter((r) => r.status === "QUALIFIED_BELOW").length,
      filtered: results.filter((r) => r.status === "FILTERED").length,
      insufficientHistory: results.filter((r) => r.status === "INSUFFICIENT_HISTORY").length,
      failed: results.filter((r) => r.status === "FAILED").length,
    },
    filterExcludedCount: results.filter((r) => r.status === "FILTERED").length,
    qualified: results.filter((r) => r.qualifies),
    results,
    cacheHit: false,
  };
  if (RESULT_CACHE_TTL_MS > 0) resultCache.set(cacheKey, { expiresAt: Date.now() + RESULT_CACHE_TTL_MS, value: output });
  return output;
}
