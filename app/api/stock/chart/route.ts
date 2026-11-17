import { NextResponse } from "next/server";
import { fetchChartData } from "@/lib/kis-chart";
import { fetchUsDailyPrice } from "@/lib/kis-us-daily-price";
import { getDb, getPool } from "@/lib/db";
import { loadRemoteDailyCandles } from "@/lib/remote-daily-candle-cache";
import { loadRemoteStockChart } from "@/lib/remote-stock-chart";
import { chartCandleMemoryKey, getChartCandleMemory, setChartCandleMemory } from "@/lib/chart-candle-memory-cache";
import { sql } from "drizzle-orm";
import { buildChartDataFromCandles, type ChartData, type ChartFundamentals, type OHLCVCandle } from "@/lib/kis-chart";
import { validDailyCandleSql } from "@/lib/candle-sql-quality";
import { KR_MARKET_CAP_MAX_AGE_HOURS } from "@/lib/kr-market-cap";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const startedAt = performance.now();
  const phaseDurations = new Map<string, number>();
  const measure = async <T,>(name: string, operation: () => Promise<T>): Promise<T> => {
    const phaseStartedAt = performance.now();
    try {
      return await operation();
    } finally {
      phaseDurations.set(name, Math.round(performance.now() - phaseStartedAt));
    }
  };
  const timedJson = (body: unknown, init?: ResponseInit) => {
    const response = NextResponse.json(body, init);
    const timings = [`chart;dur=${Math.max(0, Math.round(performance.now() - startedAt))}`,
      ...[...phaseDurations].map(([name, duration]) => `${name};dur=${duration}`)];
    response.headers.set("server-timing", timings.join(", "));
    return response;
  };
  const { searchParams } = new URL(request.url);
  const rawCode = searchParams.get("code");
  const code = rawCode?.trim() || null;
  const company = searchParams.get("company")?.trim() || null;
  const requestedMarket = searchParams.get("market")?.trim().toUpperCase();
  const market = requestedMarket === "US" || requestedMarket === "KR" ? requestedMarket : (code?.toUpperCase().startsWith("US:") ? "US" : "KR");
  const requestedExchange = searchParams.get("exchange")?.trim().toUpperCase();
  const exchange = ["KOSPI", "KOSDAQ", "NAS", "NYS", "AMS"].includes(requestedExchange ?? "") ? requestedExchange! : null;
  const requestedTimeframe = searchParams.get("timeframe")?.trim().toUpperCase();
  const timeframe = (["D", "W", "M"] as const).includes(requestedTimeframe as "D" | "W" | "M") ? requestedTimeframe as "D" | "W" | "M" : "D";

  if (!code || code.length > 64 || (company && company.length > 200)) {
    return timedJson({ error: "code is required" }, { status: 400 });
  }

  let resolvedExchange = exchange;
  try {
    let data: ChartData | null = null;
    let chartSource = "KIS";
    const remoteConfigured = Boolean(process.env.DAILY_CACHE_API_URL?.trim());
    let eligibilityError: "not-found" | "ambiguous" | "unavailable" | null = null;
    if (market === "KR" || market === "US") {
      try {
        const instrument = await measure("instrument-master", () => market === "KR"
          ? resolveKrCommonStockExchange(code, exchange)
          : resolveUsCommonStockExchange(code, exchange));
        resolvedExchange = instrument.exchange;
        eligibilityError = instrument.error;
      } catch {
        resolvedExchange = null;
        eligibilityError = "unavailable";
      }
    }
    if (eligibilityError) {
      const error = eligibilityError === "unavailable"
        ? `${market === "US" ? "해외" : "국내"} 활성 보통주 종목 정보를 확인할 수 없습니다. 잠시 후 다시 시도하세요.`
        : eligibilityError === "ambiguous"
          ? "동일 종목 코드가 여러 거래소에 있어 거래소를 지정해야 합니다."
          : "활성 보통주 종목 마스터에서 종목 코드를 확인할 수 없습니다.";
      return timedJson({ error, chartStatus: "UNAVAILABLE", eligibility: "FAIL_CLOSED" }, { status: eligibilityError === "unavailable" ? 503 : 422 });
    }
    const cacheMarket = resolvedExchange && (market === "KR" ? ["KOSPI", "KOSDAQ"].includes(resolvedExchange) : ["NAS", "NYS", "AMS"].includes(resolvedExchange)) ? resolvedExchange : market;
    const memoryKey = chartCandleMemoryKey({ market, code, exchange: resolvedExchange, timeframe });
    const memory = getChartCandleMemory(memoryKey);
    if (memory?.candles.length && resolvedExchange) {
      data = buildChartDataFromCandles(code, memory.candles, memory.updatedAt);
      chartSource = "PROCESS_CANDLE_MEMORY";
    }
    if (!data && resolvedExchange) {
      const remote = await measure("remote-cache", () => loadRemoteDailyCandles({ market: cacheMarket, code, timeframe }).catch(() => null));
      if (remote?.candles.length) {
        setChartCandleMemory(memoryKey, remote.candles, remote.updatedAt);
        data = buildChartDataFromCandles(code, remote.candles, remote.updatedAt);
        chartSource = "OPERATING_DB_CACHE_API";
      }
    }
    if (!data && market === "US" && resolvedExchange) {
      data = await measure("db-cache", () => loadCachedChartData(code, timeframe, market, resolvedExchange));
      if (data) chartSource = "DB_CACHE";
    }
    try {
      if (!data && resolvedExchange) {
        data = await measure("kis", () => market === "US"
          ? fetchUsChartData(code, timeframe, resolvedExchange!)
          : fetchChartData(code, timeframe));
        if (data?.candles.length) setChartCandleMemory(memoryKey, data.candles, data.candleDataUpdatedAt ?? null);
      }
    } catch {
      console.warn(`[API /stock/chart] KIS unavailable; trying ${market} DB cache`);
      if (market !== "US") {
        data = await measure("db-cache", () => loadCachedChartData(code, timeframe, market, resolvedExchange));
        if (data) chartSource = "DB_CACHE";
      }
    }
    if (!data && resolvedExchange) {
      data = await measure("db-cache", () => loadCachedChartData(code, timeframe, market, resolvedExchange));
      if (data) chartSource = "DB_CACHE";
    }
    if (!data && remoteConfigured && resolvedExchange) {
      data = await measure("remote-chart-fallback", () => loadRemoteStockChart({ market, code, company, timeframe, exchange: resolvedExchange, callerUrl: request.url }));
      if (data) {
        chartSource = "OPERATING_CHART_API";
        setChartCandleMemory(memoryKey, data.candles, data.candleDataUpdatedAt ?? null);
      }
    }
    if (!data) {
      const fundamentals = await loadFundamentalsSnapshot(code, market, timeframe, resolvedExchange).catch(() => unknownFundamentals(market));
      return timedJson(
        { error: remoteConfigured ? "원격 캐시와 실시간 시세에서 차트 데이터를 찾지 못했습니다." : "차트 데이터를 불러올 수 없습니다. KIS API 자격증명을 확인하세요.", chartStatus: "UNAVAILABLE", fundamentals },
        { status: 503 }
      );
    }

    // caller가 넘긴 company명이 있으면 덮어씀
    if (company) data.company = company;
    if (chartSource === "DB_CACHE" || chartSource === "OPERATING_DB_CACHE_API" || chartSource === "OPERATING_CHART_API" || chartSource === "PROCESS_CANDLE_MEMORY") data.fundamentals = { ...unknownFundamentals(market), status: "STALE", source: chartSource };
    data.fundamentals = await measure("fundamentals", () => loadChartFundamentals(data!, market, timeframe, resolvedExchange).catch(() => unknownFundamentals(market)));

    return timedJson(data);
  } catch (err: any) {
    console.error("[API /stock/chart] Error:", err instanceof Error ? err.message : "unknown error");
    const fundamentals = await loadFundamentalsSnapshot(code, market, timeframe, resolvedExchange).catch(() => unknownFundamentals(market));
    return timedJson({ error: "차트 데이터를 처리할 수 없습니다.", chartStatus: "UNAVAILABLE", fundamentals }, { status: 502 });
  }
}

async function loadCachedChartData(rawCode: string, timeframe: "D" | "W" | "M", market: "KR" | "US", exchange: string | null): Promise<ChartData | null> {
  const code = rawCode.replace(/^US:/i, "").trim().toUpperCase();
  const result = market === "US"
    ? await getPool().query(`SELECT date AS "date", open, high, low, close, volume, fetched_at AS "fetchedAt" FROM (
        SELECT candle_date AS date, open, high, low, close, volume, fetched_at,
               ROW_NUMBER() OVER (PARTITION BY candle_date ORDER BY fetched_at DESC) AS rn
          FROM us_instrument_universe_candles
         WHERE code = $1 AND timeframe = $2 AND ${validDailyCandleSql("us_instrument_universe_candles")}
           AND ($3::text IS NULL OR market = $3)
      ) cached WHERE rn = 1 ORDER BY date ASC`, [code, timeframe, exchange])
    : await getDb().execute(sql`SELECT date AS "date", open, high, low, close, volume, fetched_at AS "fetchedAt" FROM (
        SELECT candle_date AS date, open, high, low, close, volume, fetched_at,
               ROW_NUMBER() OVER (PARTITION BY candle_date ORDER BY fetched_at DESC) AS rn
          FROM kr_instrument_universe_candles
         WHERE code = ${code} AND timeframe = ${timeframe}
           AND (${exchange === "KOSPI" || exchange === "KOSDAQ" ? sql`market = ${exchange}` : sql`true`})
           AND ${sql.raw(validDailyCandleSql("kr_instrument_universe_candles"))}
      ) cached WHERE rn = 1 ORDER BY date ASC`);
  const candles = (result.rows as Array<Record<string, unknown>>).map((row): OHLCVCandle => ({
    date: String(row.date), open: Number(row.open), high: Number(row.high), low: Number(row.low), close: Number(row.close), volume: Number(row.volume),
  })).filter((candle) => /^\d{8}$/.test(candle.date) && [candle.open, candle.high, candle.low, candle.close, candle.volume].every(Number.isFinite)
    && Math.min(candle.open, candle.high, candle.low, candle.close) > 0 && candle.volume >= 0
    && candle.high >= Math.max(candle.open, candle.low, candle.close) && candle.low <= Math.min(candle.open, candle.high, candle.close));
  const fetchedAt = result.rows.at(-1)?.fetchedAt ? new Date(String(result.rows.at(-1)?.fetchedAt)).toISOString() : null;
  return candles.length ? buildChartDataFromCandles(code, candles, fetchedAt) : null;
}

async function resolveUsCommonStockExchange(codeWithPrefix: string, requestedExchange: string | null): Promise<{ exchange: string | null; error: "not-found" | "ambiguous" | null }> {
  const code = codeWithPrefix.replace(/^US:/i, "").trim().toUpperCase();
  const result = await getPool().query<{ market: string }>(
    `SELECT market FROM us_common_stock_universe
      WHERE code = $1 AND enabled = true AND instrument_type = 'COMMON_STOCK'
        AND COALESCE(is_etf, false) = false AND COALESCE(is_warrant, false) = false
        AND COALESCE(is_derivative, false) = false AND COALESCE(is_dr, false) = false
        AND COALESCE(is_leveraged, false) = false AND COALESCE(is_inverse, false) = false
        AND market IN ('NAS', 'NYS', 'AMS') AND ($2::text IS NULL OR market = $2)
      ORDER BY market LIMIT 2`,
    [code, requestedExchange],
  );
  const markets = [...new Set(result.rows.map((row) => row.market).filter((value) => ["NAS", "NYS", "AMS"].includes(value)))];
  if (markets.length === 1) return { exchange: markets[0], error: null };
  return { exchange: null, error: markets.length > 1 ? "ambiguous" : "not-found" };
}

async function resolveKrCommonStockExchange(codeWithPrefix: string, requestedExchange: string | null): Promise<{ exchange: string | null; error: "not-found" | "ambiguous" | null }> {
  const code = codeWithPrefix.trim().toUpperCase();
  const result = await getPool().query<{ market: string }>(
    `SELECT market FROM kr_common_stock_universe
      WHERE code = $1 AND enabled = true AND instrument_type = 'COMMON_STOCK'
        AND COALESCE(is_suspended, false) = false
        AND COALESCE(trading_halt_code, '') NOT IN ('Y', '1')
        AND COALESCE(liquidation_code, '') NOT IN ('Y', '1')
        AND COALESCE(managed_issue_code, '') <> 'Y'
        AND market IN ('KOSPI', 'KOSDAQ') AND ($2::text IS NULL OR market = $2)
      ORDER BY market LIMIT 2`,
    [code, requestedExchange],
  );
  const markets = [...new Set(result.rows.map((row) => row.market).filter((value) => ["KOSPI", "KOSDAQ"].includes(value)))];
  if (markets.length === 1) return { exchange: markets[0], error: null };
  return { exchange: null, error: markets.length > 1 ? "ambiguous" : "not-found" };
}

function unknownFundamentals(market: string): ChartFundamentals {
  return { marketCap: null, latestTradingValue: null, averageTradingValue20: null, latestVolume: null, averageVolume20: null, rvol: null, currency: market === "US" ? "USD" : "KRW", observedAt: null, fetchedAt: null, source: null, status: "UNKNOWN" };
}

async function loadChartFundamentals(data: ChartData, market: string, timeframe: "D" | "W" | "M", exchange: string | null): Promise<ChartFundamentals> {
  const db = getDb();
  const code = data.code.replace(/^US:/i, "").trim().toUpperCase();
  const table = market === "US" ? "us_instrument_universe_candles" : "kr_instrument_universe_candles";
  const tradingValueColumn = market === "US" ? `trading_value AS "tradingValue"` : `NULL AS "tradingValue"`;
  const usExchange = market === "US" && ["NAS", "NYS", "AMS"].includes(exchange ?? "") ? exchange : null;
  const krExchange = market === "KR" && ["KOSPI", "KOSDAQ"].includes(exchange ?? "") ? exchange : null;
  const snapshotExchange = usExchange ?? krExchange;
  const [rows, stored] = await Promise.all([
    snapshotExchange
      ? db.execute(sql`SELECT market_cap AS "marketCap", trading_value AS "tradingValue", volume, currency, observed_at AS "observedAt", fetched_at AS "fetchedAt", source FROM instrument_fundamental_snapshots WHERE market = ${snapshotExchange} AND code = ${code} ORDER BY fetched_at DESC LIMIT 1`)
      : db.execute(sql`SELECT market_cap AS "marketCap", trading_value AS "tradingValue", volume, currency, observed_at AS "observedAt", fetched_at AS "fetchedAt", source FROM instrument_fundamental_snapshots WHERE code = ${code} ORDER BY fetched_at DESC LIMIT 1`),
    db.execute(sql.raw(`SELECT ${tradingValueColumn}, c.close, c.volume FROM ${table} c WHERE c.code = '${code.replace(/'/g, "''")}' AND c.timeframe = '${timeframe}' ${snapshotExchange ? `AND c.market = '${snapshotExchange}'` : ""} AND ${validDailyCandleSql("c")} ORDER BY c.candle_date DESC LIMIT 21`)),
  ]);
  const snapshot = (rows.rows[0] ?? {}) as Record<string, unknown>;
  const storedCandles = (stored.rows as Array<Record<string, unknown>>).map((row) => ({ volume: finiteOrNull(row.volume), tradingValue: finiteOrNull(row.tradingValue) ?? derivedTradingValue(row.close, row.volume) })).filter((row) => row.volume !== null && row.tradingValue !== null);
  const candles = storedCandles.length ? storedCandles.reverse() : data.candles.filter((c) => Number.isFinite(c.volume) && c.volume >= 0).slice(-21);
  const previous = candles.slice(0, -1);
  const latest = candles.at(-1);
  const averageVolume20 = meanOrNull(previous.map((c) => c.volume));
  const averageTradingValue20 = meanOrNull(previous.map((c) => c.tradingValue));
  const fetchedAt = snapshot.fetchedAt ? new Date(String(snapshot.fetchedAt)).toISOString() : null;
  const snapshotFresh = isChartSnapshotFresh(snapshot, market);
  const snapshotHasValues = hasChartSnapshotValues(snapshot);
  const marketCap = snapshotFresh ? finiteOrNull(snapshot.marketCap) : null;
  const latestTradingValue = latest?.tradingValue ?? (snapshotFresh ? finiteOrNull(snapshot.tradingValue) : null);
  const latestVolume = latest?.volume ?? null;
  const hasData = marketCap !== null || latestTradingValue !== null || latestVolume !== null || averageVolume20 !== null;
  return { marketCap, latestTradingValue, averageTradingValue20, latestVolume, averageVolume20, rvol: averageVolume20 && latestVolume ? latestVolume / averageVolume20 : null, currency: market === "KR" ? "KRW" : String(snapshot.currency ?? "USD"), observedAt: snapshot.observedAt ? new Date(String(snapshot.observedAt)).toISOString() : null, fetchedAt, source: snapshot.source ? String(snapshot.source) : null, status: snapshotHasValues && !snapshotFresh ? "STALE" : !hasData ? "UNKNOWN" : "AVAILABLE" };
}

function meanOrNull(values: Array<number | null | undefined>) {
  const valid = values.filter((value): value is number => value != null && Number.isFinite(value));
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
}

function finiteOrNull(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function derivedTradingValue(close: unknown, volume: unknown): number | null {
  const price = finiteOrNull(close);
  const amount = finiteOrNull(volume);
  return price !== null && amount !== null ? price * amount : null;
}

async function loadFundamentalsSnapshot(rawCode: string | null, market: string, timeframe: "D" | "W" | "M", exchange: string | null): Promise<ChartFundamentals> {
  if (!rawCode) return unknownFundamentals(market);
  const db = getDb();
  const code = rawCode.replace(/^US:/i, "").trim().toUpperCase();
  const table = market === "US" ? "us_instrument_universe_candles" : "kr_instrument_universe_candles";
  const tradingValueColumn = market === "US" ? `trading_value AS "tradingValue"` : `NULL AS "tradingValue"`;
  const usExchange = market === "US" && ["NAS", "NYS", "AMS"].includes(exchange ?? "") ? exchange : null;
  const krExchange = market === "KR" && ["KOSPI", "KOSDAQ"].includes(exchange ?? "") ? exchange : null;
  const snapshotExchange = usExchange ?? krExchange;
  const [rows, stored] = await Promise.all([
    snapshotExchange
      ? db.execute(sql`SELECT market_cap AS "marketCap", trading_value AS "tradingValue", volume, currency, observed_at AS "observedAt", fetched_at AS "fetchedAt", source FROM instrument_fundamental_snapshots WHERE market = ${snapshotExchange} AND code = ${code} ORDER BY fetched_at DESC LIMIT 1`)
      : db.execute(sql`SELECT market_cap AS "marketCap", trading_value AS "tradingValue", volume, currency, observed_at AS "observedAt", fetched_at AS "fetchedAt", source FROM instrument_fundamental_snapshots WHERE code = ${code} ORDER BY fetched_at DESC LIMIT 1`),
    db.execute(sql.raw(`SELECT ${tradingValueColumn}, c.close, c.volume FROM ${table} c WHERE c.code = '${code.replace(/'/g, "''")}' AND c.timeframe = '${timeframe}' ${snapshotExchange ? `AND c.market = '${snapshotExchange}'` : ""} AND ${validDailyCandleSql("c")} ORDER BY c.candle_date DESC LIMIT 21`)),
  ]);
  const snapshot = (rows.rows[0] ?? {}) as Record<string, unknown>;
  const candles = (stored.rows as Array<Record<string, unknown>>).map((row) => ({ tradingValue: finiteOrNull(row.tradingValue) ?? derivedTradingValue(row.close, row.volume), volume: finiteOrNull(row.volume) })).filter((row) => row.volume !== null && row.tradingValue !== null).reverse();
  const latest = candles.at(-1);
  const previous = candles.slice(0, -1);
  const averageVolume20 = meanOrNull(previous.map((row) => row.volume));
  const averageTradingValue20 = meanOrNull(previous.map((row) => row.tradingValue));
  const fetchedAt = snapshot.fetchedAt ? new Date(String(snapshot.fetchedAt)).toISOString() : null;
  const snapshotFresh = isChartSnapshotFresh(snapshot, market);
  const snapshotHasValues = hasChartSnapshotValues(snapshot);
  const marketCap = snapshotFresh ? finiteOrNull(snapshot.marketCap) : null;
  const latestTradingValue = latest?.tradingValue ?? (snapshotFresh ? finiteOrNull(snapshot.tradingValue) : null);
  const latestVolume = latest?.volume ?? (snapshotFresh ? finiteOrNull(snapshot.volume) : null);
  const hasData = marketCap !== null || latestTradingValue !== null || latestVolume !== null || averageVolume20 !== null;
  return { marketCap, latestTradingValue, averageTradingValue20, latestVolume, averageVolume20, rvol: averageVolume20 && latestVolume ? latestVolume / averageVolume20 : null, currency: market === "KR" ? "KRW" : String(snapshot.currency ?? "USD"), observedAt: snapshot.observedAt ? new Date(String(snapshot.observedAt)).toISOString() : null, fetchedAt, source: snapshot.source ? String(snapshot.source) : null, status: snapshotHasValues && !snapshotFresh ? "STALE" : !hasData ? "UNKNOWN" : "AVAILABLE" };
}

function isChartSnapshotFresh(snapshot: Record<string, unknown>, market: string): boolean {
  if (market === "KR" && snapshot.currency !== "KRW") return false;
  const fetchedAt = snapshot.fetchedAt == null ? NaN : new Date(String(snapshot.fetchedAt)).getTime();
  const ageMs = Date.now() - fetchedAt;
  const maxAgeMs = (market === "KR" ? KR_MARKET_CAP_MAX_AGE_HOURS : 48) * 60 * 60 * 1000;
  return Number.isFinite(fetchedAt) && ageMs >= 0 && ageMs <= maxAgeMs;
}

function hasChartSnapshotValues(snapshot: Record<string, unknown>): boolean {
  return [snapshot.marketCap, snapshot.tradingValue, snapshot.volume].some((value) => value !== null && value !== undefined);
}

async function fetchUsChartData(rawCode: string, timeframe: "D" | "W" | "M", requestedExchange: string): Promise<ChartData | null> {
  const code = rawCode.replace(/^US:/i, "").trim().toUpperCase();
  const result = await fetchUsDailyPrice({ code, market: requestedExchange, timeframe });
  if (!result?.ok || result.candles.length === 0) return null;
  const candles = result.candles.map((c) => ({ date: c.date, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume })).sort((a, b) => a.date.localeCompare(b.date));
  const last = candles.at(-1)!;
  const previous = candles.at(-2);
  const change = previous ? last.close - previous.close : 0;
  const rate = previous ? (change / previous.close) * 100 : 0;
  return { code, company: code, candles, indicators: { rsi14: null, macd: null, macdSignal: null, macdHist: null, bbUpper: null, bbMiddle: null, bbLower: null }, latestPrice: last.close, latestChange: `${change >= 0 ? "+" : ""}${change.toFixed(2)}`, latestChangeRate: `${rate >= 0 ? "+" : ""}${rate.toFixed(2)}%`, candleDataUpdatedAt: new Date().toISOString() };
}
