import type { UsDailyScanContext } from "@/lib/us-daily-scan-context";
import { createUsDailyScanContext } from "@/lib/us-daily-scan-context";
import { analyzeUsObvSignal, calculateUsObvSeries } from "@/lib/us-obv-signal";
import { calculateAdlSeries } from "@/lib/us-adl";
import { loadFeatureModuleSettings } from "@/lib/feature-module-settings";

export type UsDailyTrendPolicy = { obvSignalPeriod?: number; adlSignalPeriod?: number; minScore?: number; minRvol?: number; minMfi?: number; maxMfi?: number };

const defaults = { obvSignalPeriod: 9, adlSignalPeriod: 9 };
function ema(values: number[], period: number) { if (!values.length) return null; const k = 2 / (period + 1); let value = values[0]; for (const item of values.slice(1)) value = item * k + value * (1 - k); return value; }

export async function scanUsDailyTrend(options: { policy?: UsDailyTrendPolicy; context?: UsDailyScanContext } = {}) {
  const settings = await loadFeatureModuleSettings("us-daily-indicators");
  const evaluation = settings.featureSettings?.evaluation as Record<string, unknown> | undefined;
  const configured = { obvSignalPeriod: Number(evaluation?.obvSignalPeriod ?? defaults.obvSignalPeriod), adlSignalPeriod: Number(evaluation?.adlSignalPeriod ?? defaults.adlSignalPeriod), minScore: 100, minRvol: 0, minMfi: 0, maxMfi: 100 };
  const policy = { ...configured, ...(options.policy || {}) };
  const context = options.context || await createUsDailyScanContext({ candleLimit: 100 });
  const results: Array<Record<string, unknown>> = [];
  for (const item of context.universe.scopes) {
    const candles = [...(context.candles.get(`${item.market}:${item.code}`) || [])].sort((a, b) => a.date.localeCompare(b.date));
    const recent = candles.at(-1);
    if (!recent || candles.length < 60) { results.push({ market: item.market, code: item.code, name: item.name, qualifies: false, score: 0, status: "FAILED", candleCount: candles.length, error: `insufficient daily candles (${candles.length}/60)` }); continue; }
    const obv = calculateUsObvSeries(candles); const obvSignal = analyzeUsObvSignal(candles, { signalPeriod: configured.obvSignalPeriod, consecutiveDays: 1, crossoverLookback: 1 });
    const adl = calculateAdlSeries(candles); const adlValues = adl.map((x) => x.adl); const adlLatest = adl.at(-1); const adlPrevious = adl.at(-2); const adlSignal = ema(adlValues, configured.adlSignalPeriod); const adlPreviousSignal = ema(adlValues.slice(0, -1), configured.adlSignalPeriod);
    const obvSignalIncreasing = obvSignal.latestSignal != null && obvSignal.signalGapIncreasing;
    const adlSignalIncreasing = adlSignal != null && adlPreviousSignal != null && adlSignal > adlPreviousSignal;
    const obvConfirmed = obvSignal.aboveSignal && obvSignalIncreasing;
    const adlConfirmed = adlLatest != null && adlSignal != null && adlLatest.adl > adlSignal && adlSignalIncreasing;
    const scoreParts = { obv: Number(obvConfirmed) * 50, adl: Number(adlConfirmed) * 50 };
    const score = scoreParts.obv + scoreParts.adl;
    const rejectionReasons = [
      ...(obvConfirmed ? [] : ["obv_signal_not_increasing_or_obv_below_signal"]),
      ...(adlConfirmed ? [] : ["adl_signal_not_increasing_or_adl_below_signal"]),
    ];
    const qualifies = rejectionReasons.length === 0;
    results.push({ market: item.market, code: item.code, name: item.name, date: recent.date, close: recent.close, obv: obv.at(-1)?.obv ?? null, obvSignal: obvSignal.latestSignal, obvSignalIncreasing, adl: adlLatest?.adl ?? null, adlSignal, adlPreviousSignal, adlSignalIncreasing, score, scoreParts, rejectionReasons, qualifies, status: qualifies ? "QUALIFIED" : "NOT_QUALIFIED", candleCount: candles.length });
  }
  results.sort((a, b) => Number(b.score) - Number(a.score));
  return { ok: Boolean((context.universe.universe as any).ok), checkedAt: new Date().toISOString(), policy, dataPolicy: { source: "us_instrument_universe_candles", candleLimit: context.candleLimit, currentDayIncluded: true, indicators: ["OBV", "ADL"], excludedIndicators: ["PriceTrend", "MACD", "MFI", "Bollinger", "DMI", "Volume"], qualification: "OBV is above its Signal and Signal is increasing AND ADL is above its Signal and Signal is increasing" }, instrumentCount: results.length, successCount: results.filter((x) => x.status !== "FAILED").length, failureCount: results.filter((x) => x.status === "FAILED").length, qualified: results.filter((x) => x.qualifies), results };
}
