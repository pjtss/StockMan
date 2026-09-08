import { NextResponse } from "next/server";
import { loadAccumulationInstruments } from "@/lib/accumulation-repository";
import { calculateKrBollingerBands } from "@/lib/kr-bollinger-band";
import type { AccumulationInstrument } from "@/lib/accumulation-scan";

export const dynamic = "force-dynamic";

function ema(values: number[], period: number) {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let value = values.slice(0, period).reduce((sum, item) => sum + item, 0) / period;
  for (const item of values.slice(period)) value = item * k + value * (1 - k);
  return value;
}

function recentRvolAverage(candles: AccumulationInstrument["candles"], count = 5) {
  const rows = [...candles].sort((a, b) => a.date.localeCompare(b.date));
  const rvols = rows.slice(-count).map((row, index) => {
    const rowIndex = rows.length - count + index;
    const baseline = rows.slice(rowIndex - 20, rowIndex).map((item) => Number(item.volume));
    if (baseline.length !== 20) return null;
    const average = baseline.reduce((sum, item) => sum + item, 0) / 20;
    return average > 0 ? Number(row.volume) / average : null;
  });
  return rvols.length === count && rvols.every((value) => value !== null) ? rvols.reduce((sum, value) => sum + (value ?? 0), 0) / count : null;
}

export async function GET() {
  const checkedAt = new Date().toISOString();
  try {
    const instruments = await loadAccumulationInstruments("KR", new Date());
    const results = [];
    for (const item of instruments) {
      if (item.marketCap === null || item.marketCap <= 30_000_000_000 || item.candles.length < 41) continue;
      const candles = [...item.candles].sort((a, b) => a.date.localeCompare(b.date));
      const bands = calculateKrBollingerBands(candles, 20, 2);
      const latest = candles.at(-1);
      const ema9 = ema(candles.map((row) => Number(row.close)), 9);
      const recentBands = bands.slice(-4);
      const priorBands = recentBands.slice(0, -1);
      const touchedLower = priorBands.some((band) => { const candle = candles.find((row) => row.date === band.date); return candle ? Number(candle.low) <= band.lower : false; });
      const latestBand = bands.at(-1);
      const rebound = touchedLower && latestBand ? { qualifies: Number(latest?.close) >= latestBand.lower, state: "LOWER_TOUCH_THEN_REBOUND" as const } : { qualifies: false, state: "NO_REBOUND" as const };
      const rvolAverage = recentRvolAverage(candles, 5);
      if (!latest || !latestBand || ema9 === null || !rebound.qualifies || !(Number(latest.low) <= ema9 && ema9 <= Number(latest.high)) || rvolAverage === null || rvolAverage < 1) continue;
      results.push({ market: item.market, code: item.code, name: item.name, candleDate: latest.date, reboundState: rebound.state, ema9: Number(ema9.toFixed(4)), rvolAverage: Number(rvolAverage.toFixed(4)), lowerBand: latestBand.lower });
    }
    results.sort((a, b) => b.rvolAverage - a.rvolAverage || a.code.localeCompare(b.code));
    return NextResponse.json({ ok: true, source: "local_db_daily_candles", checkedAt, candidateCount: results.length, tickers: results.map((item) => item.code).join(","), results });
  } catch (error) {
    return NextResponse.json({ ok: false, source: "local_db_daily_candles", checkedAt, error: error instanceof Error ? error.message.slice(0, 300) : "KR_BOLLINGER_REBOUND_EMA9_RVOL_AVG_FAILED" }, { status: 503 });
  }
}
