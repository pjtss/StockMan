import { NextResponse } from "next/server";
import { loadStoredKrInstrumentScopes } from "@/lib/kr-instruments";
import { loadCachedKrDailyCandlesBulk } from "@/lib/kr-daily-price-cache";
import { calculateKrBollingerBands } from "@/lib/kr-bollinger-band";
import { detectBollingerRebound } from "@/lib/bollinger-rebound";
import type { OHLCVCandle } from "@/lib/kis-chart";

export const dynamic = "force-dynamic";

function recentRvols(candles: OHLCVCandle[], count = 5) {
  const rows = [...candles].sort((a, b) => a.date.localeCompare(b.date));
  return rows.slice(-count).map((row, index, recent) => {
    const rowIndex = rows.length - count + index;
    const baseline = rows.slice(Math.max(0, rowIndex - 20), rowIndex).map((item) => Number(item.volume));
    const average = baseline.length === 20 ? baseline.reduce((sum, value) => sum + value, 0) / baseline.length : null;
    return { date: row.date, rvol: average && average > 0 ? Number((Number(row.volume) / average).toFixed(4)) : null };
  });
}

export async function GET() {
  const checkedAt = new Date().toISOString();
  try {
    const universe = await loadStoredKrInstrumentScopes();
    const candles = await loadCachedKrDailyCandlesBulk(universe.scopes, 120, "D");
    const results = [];
    for (const item of universe.scopes) {
      const series = candles.get(`${item.market}:${item.code}`) ?? [];
      if (series.length < 41) continue;
      const bands = calculateKrBollingerBands(series, 20, 2);
      const rebound = detectBollingerRebound(bands, { enabled: true, lookback: 3, tolerancePercent: 0.5 });
      const rvols = recentRvols(series, 5);
      if (!rebound.qualifies || rvols.length !== 5 || rvols.some((point) => point.rvol === null || point.rvol < 1)) continue;
      const latest = bands.at(-1);
      if (!latest) continue;
      results.push({ market: item.market, code: item.code, name: item.name, candleDate: latest.date, candleUpdatedAt: null, rvols, reboundState: rebound.state, breakoutIndex: rebound.breakoutIndex, retestDistancePercent: rebound.retestDistancePercent, band: latest });
    }
    results.sort((a, b) => (b.rvols.at(-1)?.rvol ?? 0) - (a.rvols.at(-1)?.rvol ?? 0) || a.code.localeCompare(b.code));
    return NextResponse.json({ ok: true, source: "local_db_daily_candles", checkedAt, criteria: { timeframe: "D", bollinger: "20-period close-based lower band, 2 standard deviations", rebound: "prior close below lower band within 3 trading days, latest close back within 0.5% above lower band", rvol: "each of the latest 5 trading days >= 1.0 using prior 20-day average volume" }, universeCount: universe.scopes.length, candidateCount: results.length, tickers: results.map((item) => item.code).join(","), results });
  } catch (error) {
    return NextResponse.json({ ok: false, source: "local_db_daily_candles", checkedAt, error: error instanceof Error ? error.message.slice(0, 300) : "KR_BOLLINGER_REBOUND_RVOL_FAILED" }, { status: 503 });
  }
}
