import { getPool } from "./db";
import type { ScreenerRequest, ScreenerResult } from "./screener-types";
import {
  evaluateScreenerFilters,
  rankScreenerResults,
} from "./screener-engine";

const inFlightScreenerRuns = new Map<string, Promise<ScreenerResult[]>>();

function screenerRequestKey(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(screenerRequestKey).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${screenerRequestKey(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function ema(values: number[], period = 9) {
  if (!values.length) return [];
  const alpha = 2 / (period + 1);
  return values.reduce<number[]>((out, value, index) => {
    out.push(
      index === 0 ? value : value * alpha + out[index - 1] * (1 - alpha),
    );
    return out;
  }, []);
}

function flowSeries(candles: any[], enabled: boolean) {
  if (!enabled) return { obvSignalTrend: null, adlSignalTrend: null };
  let obv = 0;
  let adl = 0;
  const obvs: number[] = [];
  const adls: number[] = [];
  for (let i = 0; i < candles.length; i += 1) {
    const close = Number(candles[i].close);
    const volume = Number(candles[i].volume || 0);
    if (i > 0) obv += volume * Math.sign(close - Number(candles[i - 1].close));
    const high = Number(candles[i].high ?? close);
    const low = Number(candles[i].low ?? close);
    adl +=
      high === low
        ? 0
        : ((close - low - (high - close)) / (high - low)) * volume;
    obvs.push(obv);
    adls.push(adl);
  }
  const obvSignal = ema(obvs, 9),
    adlSignal = ema(adls, 9);
  const trend = (values: number[]) =>
    values.length < 2
      ? null
      : values.at(-1)! > values.at(-2)!
        ? "RISING"
        : values.at(-1)! < values.at(-2)!
          ? "FALLING"
          : "FLAT";
  return { obvSignalTrend: trend(obvSignal), adlSignalTrend: trend(adlSignal) };
}

export function calculateRvol(latestVolume: number, baselineVolumes: number[]) {
  if (!Number.isFinite(latestVolume) || baselineVolumes.length === 0) return null;
  const average = baselineVolumes.reduce((sum, volume) => sum + volume, 0) / baselineVolumes.length;
  return average > 0 ? latestVolume / average : null;
}

async function runDbScreenerUncached(
  request: ScreenerRequest,
): Promise<ScreenerResult[]> {
  if (request.market === "ALL") {
    const [kr, us] = await Promise.all([
      runDbScreener({ ...request, market: "KR" }),
      runDbScreener({ ...request, market: "US" }),
    ]);
    return rankScreenerResults([...kr, ...us], request);
  }
  const pool = getPool();
  const isUs = request.market === "US";
  const timeframe = request.timeframe ?? "D";
  const allMarkets = isUs ? ["NAS", "NYS", "AMS"] : ["KOSPI", "KOSDAQ"];
  const markets = request.exchange?.length
    ? allMarkets.filter((market) => request.exchange!.includes(market))
    : allMarkets;
  if (markets.length === 0) return [];
  const universeTable = isUs
    ? "us_common_stock_universe"
    : "kr_common_stock_universe";
  const candleTable = isUs
    ? "us_instrument_universe_candles"
    : "kr_instrument_universe_candles";
  const requestedTimeframes = [
    timeframe,
    ...Object.entries(request.ema9Conditions ?? {})
      .filter(([, value]) => value && value !== "ANY")
      .map(([tf]) => tf),
  ].filter((value, index, values) => values.indexOf(value) === index);
  const asOf = request.asOf && request.asOf !== "LATEST" ? request.asOf : null;
  const asOfKey = asOf?.replaceAll("-", "") ?? null;
  const marketCapFilters = request.logic === "OR"
    ? []
    : (request.filters ?? []).filter((filter) => filter.field === "marketCap");
  const minMarketCap = marketCapFilters
    .filter((filter) => filter.operator === ">=" || filter.operator === ">")
    .map((filter) => Number(filter.value))
    .filter(Number.isFinite)
    .sort((a, b) => b - a)[0] ?? null;
  const maxMarketCap = marketCapFilters
    .filter((filter) => filter.operator === "<=" || filter.operator === "<")
    .map((filter) => Number(filter.value))
    .filter(Number.isFinite)
    .sort((a, b) => a - b)[0] ?? null;
  const latestSummaryTable = isUs
    ? "us_latest_daily_candles"
    : "kr_latest_daily_candles";
  const latestCtes = asOf
    ? `market_latest AS (SELECT market, MAX(candle_date) AS candle_date FROM ${candleTable} WHERE timeframe='D' AND volume > 0 AND market=ANY($1) AND candle_date <= \$2 GROUP BY market), instrument_daily_latest AS (SELECT market,code,MAX(candle_date) AS candle_date FROM ${candleTable} WHERE timeframe='D' AND volume > 0 AND market=ANY($1) AND candle_date <= \$2 GROUP BY market,code)`
    : `market_latest AS (SELECT market, MAX(candle_date) AS candle_date FROM ${latestSummaryTable} WHERE volume > 0 AND market=ANY($1) GROUP BY market), instrument_daily_latest AS (SELECT market,code,candle_date FROM ${latestSummaryTable} WHERE volume > 0 AND market=ANY($1))`;
  const candleLookups = requestedTimeframes
    .map(
      (requestedTimeframe, index) => `SELECT c${index}.candle_date,c${index}.fetched_at,c${index}.close,c${index}.high,c${index}.low,c${index}.volume,c${index}.timeframe
        FROM ${candleTable} c${index}
        WHERE c${index}.market=u.market AND c${index}.code=u.code
          AND c${index}.timeframe='${requestedTimeframe}'
          AND c${index}.volume > 0
          AND ($2 IS NULL OR c${index}.candle_date <= $2)
        ORDER BY c${index}.candle_date DESC
        LIMIT 65`,
    )
    .join(" UNION ALL ");
  const rows = (
    await pool.query(
      `WITH ${latestCtes} SELECT u.market,u.code,u.name,u.enabled,f.market_cap,f.shares_outstanding,f.currency,c.candle_date,c.fetched_at,c.close,c.high,c.low,c.volume,c.timeframe FROM ${universeTable} u LEFT JOIN LATERAL (SELECT market_cap,shares_outstanding,currency FROM instrument_fundamental_snapshots f WHERE f.market=u.market AND f.code=u.code AND ($3::date IS NULL OR f.observed_at < ($3::date + INTERVAL '1 day')) ORDER BY f.observed_at DESC NULLS LAST, f.fetched_at DESC NULLS LAST LIMIT 1) f ON true JOIN market_latest ml ON ml.market=u.market JOIN instrument_daily_latest dl ON dl.market=u.market AND dl.code=u.code AND dl.candle_date=ml.candle_date JOIN LATERAL (${candleLookups}) c ON true WHERE u.enabled=true AND u.daily_active=true AND u.instrument_type='COMMON_STOCK' AND u.market=ANY($1) AND ($4::numeric IS NULL OR f.market_cap >= $4) AND ($5::numeric IS NULL OR f.market_cap <= $5)`,
      [markets, asOfKey, asOf, minMarketCap, maxMarketCap],
    )
  ).rows;
  const groups = new Map<string, any>();
  for (const row of rows) {
    const key = `${row.market}:${row.code}`;
    if (!groups.has(key))
      groups.set(key, { ...row, candles: [], byTimeframe: new Map() });
    const group = groups.get(key);
    const bucket = group.byTimeframe.get(row.timeframe ?? timeframe) ?? [];
    bucket.push(row);
    group.byTimeframe.set(row.timeframe ?? timeframe, bucket);
    if ((row.timeframe ?? timeframe) === timeframe) group.candles.push(row);
  }
  for (const group of groups.values()) {
    group.candles.sort((a: any, b: any) => String(a.candle_date).localeCompare(String(b.candle_date)));
    for (const candles of group.byTimeframe.values()) {
      candles.sort((a: any, b: any) => String(a.candle_date).localeCompare(String(b.candle_date)));
    }
  }
  const results: ScreenerResult[] = [];
  const requestedMetricFields = new Set((request.filters ?? []).map((filter) => filter.field));
  const needsFlow = requestedMetricFields.has(`${timeframe}.obv.signalTrend`)
    || requestedMetricFields.has(`${timeframe}.adl.signalTrend`);
  for (const item of groups.values()) {
    if (request.exchange?.length && !request.exchange.includes(item.market))
      continue;
    const c = item.candles;
    if (c.length < 21) continue;
    const closes = c.map((x: any) => Number(x.close)),
      last = c.at(-1),
      prev = c.at(-2);
    const baselineVolumes = c.slice(-21, -1);
    const avg = baselineVolumes.length
      ? baselineVolumes.reduce((s: number, x: any) => s + Number(x.volume || 0), 0) / baselineVolumes.length
      : null;
    const mid =
      closes.slice(-20).reduce((a: number, b: number) => a + b, 0) / 20;
    const sd = Math.sqrt(
      closes
        .slice(-20)
        .reduce((a: number, b: number) => a + (b - mid) ** 2, 0) / 20,
    );
    const lower = mid - 2 * sd;
    const prefix = timeframe;
    const e9 = ema(closes, 9),
      e20 = ema(closes, 20),
      e60 = ema(closes, 60),
      golden =
        e9.length > 1 && e9.at(-2)! <= e20.at(-2)! && e9.at(-1)! > e20.at(-1)!;
    const flow = flowSeries(c, needsFlow);
    const metrics: any = {
      marketCap: item.market_cap == null ? null : Number(item.market_cap),
      [`${prefix}.close`]: Number(last.close),
      [`${prefix}.changePct`]: prev && Number(prev.close) !== 0
        ? ((Number(last.close) - Number(prev.close)) / Number(prev.close)) * 100
        : null,
      [`${prefix}.ema9`]: e9.at(-1) ?? null,
      [`${prefix}.ema20`]: e20.at(-1) ?? null,
      [`${prefix}.ema60`]: e60.at(-1) ?? null,
      [`${prefix}.closeVsEma20`]: e20.length && Number(last.close) >= e20.at(-1)! ? "ABOVE" : "NOT_ABOVE",
      [`${prefix}.closeVsEma60`]: e60.length && Number(last.close) >= e60.at(-1)! ? "ABOVE" : "NOT_ABOVE",
      [`${prefix}.emaGoldenCross`]: golden,
      [`${prefix}.high`]: Number(last.high),
      [`${prefix}.low`]: Number(last.low),
      [`${prefix}.volume`]: Number(last.volume),
      [`${prefix}.rvol`]: avg ? calculateRvol(Number(last.volume), baselineVolumes.map((x: any) => Number(x.volume || 0))) : null,
      [`${prefix}.bb.upper`]: mid + 2 * sd,
      [`${prefix}.bb.middle`]: mid,
      [`${prefix}.bb.lower`]: lower,
      [`${prefix}.bb.width`]: mid ? ((4 * sd) / mid) * 100 : null,
      [`${prefix}.bb.lowerTouch`]: Number(last.low) <= lower,
      [`${prefix}.bb.lowerBreak`]: Number(last.close) < lower,
      [`${prefix}.obv.signalTrend`]: flow.obvSignalTrend,
      [`${prefix}.adl.signalTrend`]: flow.adlSignalTrend,
    };
    const emaConditions = Object.entries(request.ema9Conditions ?? {}).filter(
      ([, condition]) => condition && condition !== "ANY",
    );
    const emaResults = emaConditions.map(([tf, condition]) => {
      const candles = item.byTimeframe.get(tf) ?? [];
      const closes = candles.map((x: any) => Number(x.close));
      const latest = candles.at(-1);
      const latestEma9 = closes.length ? ema(closes, 9).at(-1) : null;
      const above =
        latest && latestEma9 != null && Number(latest.close) >= latestEma9;
      const passed = condition === "ABOVE" ? Boolean(above) : !above;
      return {
        field: `${tf}.closeVsEma9`,
        passed,
        actual: latestEma9 == null ? null : above ? "ABOVE" : "NOT_ABOVE",
        target: condition,
      };
    });
    const positionResults = Object.entries(request.emaPositionConditions ?? {}).filter(
      ([, condition]) => condition && condition !== "ANY",
    ).map(([period, condition]) => {
      const field = `${prefix}.closeVs${period}`;
      const actual = metrics[field];
      return { field, passed: actual === condition, actual, target: condition };
    });
    const evaluation = evaluateScreenerFilters(metrics, request);
    const allConditions = [...evaluation.conditions, ...emaResults, ...positionResults];
    const matched = allConditions.length === 0
      ? true
      : request.logic === "OR"
        ? allConditions.some((condition) => condition.passed)
        : allConditions.every((condition) => condition.passed);
    results.push({
      market: item.market,
      exchange: item.market,
      code: item.code,
      name: item.name,
      status: "ACTIVE",
      marketCap: metrics.marketCap,
      sharesOutstanding:
        item.shares_outstanding == null
          ? null
          : Number(item.shares_outstanding),
      currency: item.currency,
      candleDate: last.candle_date,
      candleFetchedAt: new Date(last.fetched_at).toISOString(),
      metrics,
      conditions: allConditions,
      matched,
      failureReasons: [
        ...evaluation.failureReasons,
        ...emaResults
          .filter((condition) => !condition.passed)
          .map((condition) => `${condition.field} ${condition.target}`),
        ...positionResults
          .filter((condition) => !condition.passed)
          .map((condition) => `${condition.field} ${condition.target}`),
      ],
      timeframeMeta: Object.fromEntries(
        (["D", "W", "M"] as const).map((tf) => {
          const candle = (item.byTimeframe.get(tf) ?? []).at(-1);
          return [
            tf,
            {
              candleDate: candle?.candle_date ?? "",
              candleFetchedAt: candle?.fetched_at
                ? new Date(candle.fetched_at).toISOString()
                : null,
            },
          ];
        }),
      ),
    });
  }
  return rankScreenerResults(
    results.filter((x) => x.matched),
    request,
  );
}

/**
 * Coalesce identical concurrent scans without retaining stale results. This
 * prevents a chart page and an API retry arriving together from executing the
 * same expensive latest-candle query twice.
 */
export function runDbScreener(request: ScreenerRequest): Promise<ScreenerResult[]> {
  const key = screenerRequestKey(request);
  const existing = inFlightScreenerRuns.get(key);
  if (existing) return existing;
  const run = runDbScreenerUncached(request).finally(() => {
    if (inFlightScreenerRuns.get(key) === run) inFlightScreenerRuns.delete(key);
  });
  inFlightScreenerRuns.set(key, run);
  return run;
}
