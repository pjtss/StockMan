import { NextResponse } from "next/server";
import { fetchChartData } from "@/lib/kis-chart";
import { fetchUsDailyPrice } from "@/lib/kis-us-daily-price";
import { getDb } from "@/lib/db";
import { sql } from "drizzle-orm";
import type { ChartData, ChartFundamentals } from "@/lib/kis-chart";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawCode = searchParams.get("code");
  const code = rawCode?.trim() || null;
  const company = searchParams.get("company") ?? code;
  const requestedMarket = searchParams.get("market")?.trim().toUpperCase();
  const market = requestedMarket === "US" || requestedMarket === "KR" ? requestedMarket : (code?.toUpperCase().startsWith("US:") ? "US" : "KR");
  const requestedTimeframe = searchParams.get("timeframe")?.trim().toUpperCase();
  const timeframe = (["D", "W", "M"] as const).includes(requestedTimeframe as "D" | "W" | "M") ? requestedTimeframe as "D" | "W" | "M" : "D";

  if (!code || code.length > 64 || (company && company.length > 200)) {
    return NextResponse.json({ error: "code is required" }, { status: 400 });
  }

  try {
    const data = market === "US"
      ? await fetchUsChartData(code, timeframe)
      : await fetchChartData(code, timeframe);
    if (!data) {
      const fundamentals = await loadFundamentalsSnapshot(code, market, timeframe).catch(() => unknownFundamentals(market));
      return NextResponse.json(
        { error: "차트 데이터를 불러올 수 없습니다. KIS API 자격증명을 확인하세요.", chartStatus: "UNAVAILABLE", fundamentals },
        { status: 503 }
      );
    }

    // caller가 넘긴 company명이 있으면 덮어씀
    if (company) data.company = company;
    data.fundamentals = await loadChartFundamentals(data, market, timeframe).catch(() => unknownFundamentals(market));

    return NextResponse.json(data);
  } catch (err: any) {
    console.error("[API /stock/chart] Error:", err instanceof Error ? err.message : "unknown error");
    const fundamentals = await loadFundamentalsSnapshot(code, market, timeframe).catch(() => unknownFundamentals(market));
    return NextResponse.json({ error: "차트 데이터를 처리할 수 없습니다.", chartStatus: "UNAVAILABLE", fundamentals }, { status: 502 });
  }
}

function unknownFundamentals(market: string): ChartFundamentals {
  return { marketCap: null, latestTradingValue: null, averageTradingValue20: null, latestVolume: null, averageVolume20: null, rvol: null, currency: market === "US" ? "USD" : "KRW", observedAt: null, fetchedAt: null, source: null, status: "UNKNOWN" };
}

async function loadChartFundamentals(data: ChartData, market: string, timeframe: "D" | "W" | "M"): Promise<ChartFundamentals> {
  const db = getDb();
  const code = data.code.replace(/^US:/i, "").trim().toUpperCase();
  const rows = await db.execute(sql`SELECT market_cap AS "marketCap", trading_value AS "tradingValue", volume, currency, observed_at AS "observedAt", fetched_at AS "fetchedAt", source FROM instrument_fundamental_snapshots WHERE code = ${code} ORDER BY fetched_at DESC LIMIT 1`);
  const snapshot = (rows.rows[0] ?? {}) as Record<string, unknown>;
  const table = market === "US" ? "us_instrument_universe_candles" : "kr_instrument_universe_candles";
  const tradingValueColumn = market === "US" ? `trading_value AS "tradingValue"` : `NULL AS "tradingValue"`;
  const stored = await db.execute(sql.raw(`SELECT ${tradingValueColumn}, close, volume FROM ${table} WHERE code = '${code.replace(/'/g, "''")}' AND timeframe = '${timeframe}' AND close IS NOT NULL ORDER BY candle_date DESC LIMIT 21`));
  const storedCandles = (stored.rows as Array<Record<string, unknown>>).map((row) => ({ volume: finiteOrNull(row.volume), tradingValue: finiteOrNull(row.tradingValue) ?? derivedTradingValue(row.close, row.volume) }));
  const candles = storedCandles.length ? storedCandles.reverse() : data.candles.filter((c) => Number.isFinite(c.volume) && c.volume >= 0).slice(-21);
  const previous = candles.slice(0, -1);
  const latest = candles.at(-1);
  const averageVolume20 = meanOrNull(previous.map((c) => c.volume));
  const averageTradingValue20 = meanOrNull(previous.map((c) => c.tradingValue));
  const fetchedAt = snapshot.fetchedAt ? new Date(String(snapshot.fetchedAt)).toISOString() : null;
  const stale = fetchedAt ? Date.now() - new Date(fetchedAt).getTime() > 48 * 60 * 60 * 1000 : false;
  const marketCap = Number.isFinite(Number(snapshot.marketCap)) ? Number(snapshot.marketCap) : null;
  const latestTradingValue = latest?.tradingValue ?? finiteOrNull(snapshot.tradingValue);
  const latestVolume = latest?.volume ?? null;
  const hasData = marketCap !== null || latestTradingValue !== null || latestVolume !== null || averageVolume20 !== null;
  return { marketCap, latestTradingValue, averageTradingValue20, latestVolume, averageVolume20, rvol: averageVolume20 && latestVolume ? latestVolume / averageVolume20 : null, currency: String(snapshot.currency ?? (market === "US" ? "USD" : "KRW")), observedAt: snapshot.observedAt ? new Date(String(snapshot.observedAt)).toISOString() : null, fetchedAt, source: snapshot.source ? String(snapshot.source) : null, status: !hasData ? "UNKNOWN" : stale ? "STALE" : "AVAILABLE" };
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

async function loadFundamentalsSnapshot(rawCode: string | null, market: string, timeframe: "D" | "W" | "M"): Promise<ChartFundamentals> {
  if (!rawCode) return unknownFundamentals(market);
  const db = getDb();
  const code = rawCode.replace(/^US:/i, "").trim().toUpperCase();
  const rows = await db.execute(sql`SELECT market_cap AS "marketCap", trading_value AS "tradingValue", volume, currency, observed_at AS "observedAt", fetched_at AS "fetchedAt", source FROM instrument_fundamental_snapshots WHERE code = ${code} ORDER BY fetched_at DESC LIMIT 1`);
  const snapshot = (rows.rows[0] ?? {}) as Record<string, unknown>;
  const table = market === "US" ? "us_instrument_universe_candles" : "kr_instrument_universe_candles";
  const tradingValueColumn = market === "US" ? `trading_value AS "tradingValue"` : `NULL AS "tradingValue"`;
  const stored = await db.execute(sql.raw(`SELECT ${tradingValueColumn}, close, volume FROM ${table} WHERE code = '${code.replace(/'/g, "''")}' AND timeframe = '${timeframe}' AND close IS NOT NULL ORDER BY candle_date DESC LIMIT 21`));
  const candles = (stored.rows as Array<Record<string, unknown>>).map((row) => ({ tradingValue: finiteOrNull(row.tradingValue) ?? derivedTradingValue(row.close, row.volume), volume: finiteOrNull(row.volume) })).reverse();
  const latest = candles.at(-1);
  const previous = candles.slice(0, -1);
  const averageVolume20 = meanOrNull(previous.map((row) => row.volume));
  const averageTradingValue20 = meanOrNull(previous.map((row) => row.tradingValue));
  const fetchedAt = snapshot.fetchedAt ? new Date(String(snapshot.fetchedAt)).toISOString() : null;
  const marketCap = finiteOrNull(snapshot.marketCap);
  const latestTradingValue = latest?.tradingValue ?? finiteOrNull(snapshot.tradingValue);
  const latestVolume = latest?.volume ?? finiteOrNull(snapshot.volume);
  const hasData = marketCap !== null || latestTradingValue !== null || latestVolume !== null || averageVolume20 !== null;
  return { marketCap, latestTradingValue, averageTradingValue20, latestVolume, averageVolume20, rvol: averageVolume20 && latestVolume ? latestVolume / averageVolume20 : null, currency: String(snapshot.currency ?? (market === "US" ? "USD" : "KRW")), observedAt: snapshot.observedAt ? new Date(String(snapshot.observedAt)).toISOString() : null, fetchedAt, source: snapshot.source ? String(snapshot.source) : null, status: fetchedAt && Date.now() - new Date(fetchedAt).getTime() > 48 * 60 * 60 * 1000 ? "STALE" : hasData ? "AVAILABLE" : "UNKNOWN" };
}

async function fetchUsChartData(rawCode: string, timeframe: "D" | "W" | "M"): Promise<ChartData | null> {
  const code = rawCode.replace(/^US:/i, "").trim().toUpperCase();
  const markets = ["NAS", "NYS", "AMS"];
  for (const exchange of markets) {
    const result = await fetchUsDailyPrice({ code, market: exchange, timeframe }).catch(() => null);
    if (!result?.ok || result.candles.length === 0) continue;
    const candles = result.candles.map((c) => ({ date: c.date, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume })).sort((a, b) => a.date.localeCompare(b.date));
    const last = candles.at(-1)!;
    const previous = candles.at(-2);
    const change = previous ? last.close - previous.close : 0;
    const rate = previous ? (change / previous.close) * 100 : 0;
    return { code, company: code, candles, indicators: { rsi14: null, macd: null, macdSignal: null, macdHist: null, bbUpper: null, bbMiddle: null, bbLower: null }, latestPrice: last.close, latestChange: `${change >= 0 ? "+" : ""}${change.toFixed(2)}`, latestChangeRate: `${rate >= 0 ? "+" : ""}${rate.toFixed(2)}%`, candleDataUpdatedAt: new Date().toISOString() };
  }
  return null;
}
