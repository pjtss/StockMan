import type { UsDailyScanContext } from "@/lib/us-daily-scan-context";
import { createUsDailyScanContext } from "@/lib/us-daily-scan-context";
import { calculateBollingerBands } from "@/lib/us-bollinger-band";
import { latestDmi } from "@/lib/us-dmi";
import { latestMacd } from "@/lib/us-macd";
import { latestMfi } from "@/lib/us-mfi";
import { analyzeUsObvSignal, calculateUsObvSeries } from "@/lib/us-obv-signal";

export type UsDailyTrendPolicy = { minScore?: number; minRvol?: number; minMfi?: number; maxMfi?: number; requirePriceTrend?: boolean };

const defaults = { minScore: 70, minRvol: 1.5, minMfi: 50, maxMfi: 85, requirePriceTrend: true };

function average(values: number[]) { return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null; }

export async function scanUsDailyTrend(options: { policy?: UsDailyTrendPolicy; context?: UsDailyScanContext } = {}) {
  const policy = { ...defaults, ...(options.policy || {}) };
  const context = options.context || await createUsDailyScanContext({ candleLimit: 100 });
  const results: Array<Record<string, unknown>> = [];
  for (const item of context.universe.scopes) {
    const candles = [...(context.candles.get(`${item.market}:${item.code}`) || [])].sort((a, b) => a.date.localeCompare(b.date));
    const recent = candles.at(-1);
    if (!recent || candles.length < 60) { results.push({ market: item.market, code: item.code, name: item.name, qualifies: false, score: 0, status: "FAILED", candleCount: candles.length, error: `insufficient daily candles (${candles.length}/60)` }); continue; }
    const closes = candles.map((c) => c.close);
    const ma20 = average(closes.slice(-20)); const ma60 = average(closes.slice(-60));
    const volumeAverage = average(candles.slice(-21, -1).map((c) => c.volume));
    const rvol = volumeAverage && volumeAverage > 0 ? recent.volume / volumeAverage : null;
    const mfi = latestMfi(candles, 14); const dmi = latestDmi(candles, 14); const macd = latestMacd(candles);
    const obv = calculateUsObvSeries(candles); const obvSignal = analyzeUsObvSignal(candles, { signalPeriod: 9, consecutiveDays: 3, crossoverLookback: 5 });
    const band = calculateBollingerBands(candles, 20, 2).at(-1);
    const scoreParts = {
      priceTrend: Number(ma20 != null && ma60 != null && recent.close > ma20 && ma20 > ma60) * 20,
      obv: Number(obvSignal.aboveSignal && obvSignal.signalGapIncreasing && (obv.at(-1)?.obv || 0) > (obv.at(-2)?.obv || 0)) * 20,
      macd: Number(Boolean(macd && macd.macd > macd.signal && macd.histogram > 0 && macd.histogramIncreasing)) * 20,
      mfi: Number(Boolean(mfi && mfi.value >= policy.minMfi && mfi.value <= policy.maxMfi && (latestMfi(candles.slice(0, -1), 14)?.value ?? 0) < mfi.value)) * 15,
      bollinger: Number(Boolean(band && recent.close > band.middle && recent.close >= band.middle)) * 15,
      volume: Number(rvol != null && rvol >= policy.minRvol) * 10,
    };
    const score = Object.values(scoreParts).reduce((a, b) => a + b, 0);
    const qualifies = score >= policy.minScore && (!policy.requirePriceTrend || scoreParts.priceTrend > 0) && (rvol == null || rvol >= policy.minRvol);
    results.push({ market: item.market, code: item.code, name: item.name, date: recent.date, close: recent.close, volume: recent.volume, ma20, ma60, rvol, mfi: mfi?.value ?? null, dmi, macd, obv: obv.at(-1)?.obv ?? null, obvSignal: obvSignal.latestSignal, bollinger: band, score, scoreParts, qualifies, status: qualifies ? "QUALIFIED" : "NOT_QUALIFIED", candleCount: candles.length });
  }
  results.sort((a, b) => Number(b.score) - Number(a.score));
  return { ok: Boolean((context.universe.universe as any).ok), checkedAt: new Date().toISOString(), policy, dataPolicy: { source: "us_daily_price_candles", indicators: ["OBV", "MACD", "MFI", "Bollinger", "DMI", "Volume"], qualification: "score >= minScore, price trend and RVOL filters" }, instrumentCount: results.length, successCount: results.filter((x) => x.status !== "FAILED").length, failureCount: results.filter((x) => x.status === "FAILED").length, qualified: results.filter((x) => x.qualifies), results };
}
