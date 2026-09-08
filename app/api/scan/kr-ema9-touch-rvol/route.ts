import { NextResponse } from "next/server";
import { loadAccumulationInstruments } from "@/lib/accumulation-repository";
import type { AccumulationInstrument } from "@/lib/accumulation-scan";

export const dynamic = "force-dynamic";

function ema(values: number[], period: number) {
  if (values.length < period) return null;
  const multiplier = 2 / (period + 1);
  let current = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  for (const value of values.slice(period)) current = value * multiplier + current * (1 - multiplier);
  return current;
}

function recentRvols(candles: AccumulationInstrument["candles"], count = 5) {
  const rows = [...candles].sort((a, b) => a.date.localeCompare(b.date));
  return rows.slice(-count).map((row, index) => {
    const rowIndex = rows.length - count + index;
    const baseline = rows.slice(rowIndex - 20, rowIndex).map((item) => Number(item.volume));
    const average = baseline.length === 20 ? baseline.reduce((sum, value) => sum + value, 0) / 20 : null;
    return { date: row.date, rvol: average && average > 0 ? Number((Number(row.volume) / average).toFixed(4)) : null };
  });
}

export async function GET() {
  const checkedAt = new Date().toISOString();
  try {
    const instruments = await loadAccumulationInstruments("KR", new Date());
    const results = [];
    for (const item of instruments) {
      if (item.marketCap === null || item.marketCap <= 30_000_000_000) continue;
      const series = item.candles;
      if (series.length < 25) continue;
      const ordered = [...series].sort((a, b) => a.date.localeCompare(b.date));
      const latest = ordered.at(-1);
      const ema9 = ema(ordered.map((row) => Number(row.close)), 9);
      const rvols = recentRvols(ordered, 5);
      if (!latest || ema9 === null || !(Number(latest.low) <= ema9 && ema9 <= Number(latest.high)) || rvols.length !== 5 || rvols.some((point) => point.rvol === null || point.rvol < 1)) continue;
      results.push({ market: item.market, code: item.code, name: item.name, candleDate: latest.date, ema9: Number(ema9.toFixed(4)), low: latest.low, high: latest.high, rvols });
    }
    results.sort((a, b) => (b.rvols.at(-1)?.rvol ?? 0) - (a.rvols.at(-1)?.rvol ?? 0) || a.code.localeCompare(b.code));
    return NextResponse.json({ ok: true, source: "local_db_daily_candles", checkedAt, candidateCount: results.length, tickers: results.map((item) => item.code).join(","), results });
  } catch (error) {
    return NextResponse.json({ ok: false, source: "local_db_daily_candles", checkedAt, error: error instanceof Error ? error.message.slice(0, 300) : "KR_EMA9_TOUCH_RVOL_FAILED" }, { status: 503 });
  }
}
