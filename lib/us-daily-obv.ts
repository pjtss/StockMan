import { fetchUsDailyPrice, type UsDailyCandle } from "@/lib/kis-us-daily-price";
import { listStoredUsInstruments } from "@/lib/us-mfi-oversold";

function obvValue(candles: UsDailyCandle[]) {
  let value = 0;
  for (let i = 1; i < candles.length; i += 1) {
    if (candles[i].close > candles[i - 1].close) value += candles[i].volume;
    else if (candles[i].close < candles[i - 1].close) value -= candles[i].volume;
  }
  return value;
}

export async function scanStoredUsDailyObv(options: { lookback?: number; concurrency?: number } = {}) {
  const lookback = Math.max(3, Math.floor(options.lookback ?? 5));
  const instruments = await listStoredUsInstruments();
  const results: any[] = [];
  let cursor = 0;
  const worker = async () => { while (cursor < instruments.length) {
    const item = instruments[cursor++];
    try {
      const daily = await fetchUsDailyPrice({ code: item.code, market: item.market });
      const candles = daily?.candles ?? [];
      if (!daily?.ok || candles.length < lookback * 2 + 1) { results.push({ market: item.market, code: item.code, name: item.name, candleCount: candles.length, obv: null, recentObv: null, priorObv: null, change: null, rising: false, error: !daily ? "KIS access token unavailable" : !daily.ok ? `KIS daily API failed (${daily.status})` : `insufficient parsed candles (${candles.length}/${lookback * 2 + 1})`, dailyDiagnostics: daily?.diagnostics ?? null }); continue; }
      const ordered = [...candles].sort((a, b) => a.date.localeCompare(b.date));
      const recent = ordered.slice(-lookback);
      const prior = ordered.slice(-(lookback * 2), -lookback);
      const recentObv = obvValue(recent), priorObv = obvValue(prior), change = recentObv - priorObv;
      const risingBars = recent.slice(1).filter((candle, i) => candle.close > recent[i].close).length;
      results.push({ market: item.market, code: item.code, name: item.name, candleCount: ordered.length, obv: obvValue(ordered), recentObv, priorObv, change, risingBars, risingBarRate: risingBars / Math.max(1, recent.length - 1), lastClose: ordered.at(-1)?.close ?? null, date: ordered.at(-1)?.date ?? null, rising: change > 0 && risingBars / Math.max(1, recent.length - 1) >= 0.4, dailyDiagnostics: daily.diagnostics });
    } catch (error) { results.push({ market: item.market, code: item.code, name: item.name, candleCount: 0, rising: false, error: error instanceof Error ? error.message : String(error) }); }
  } };
  await Promise.all(Array.from({ length: Math.min(options.concurrency ?? 1, Math.max(1, instruments.length)) }, worker));
  results.sort((a, b) => (b.change ?? -Infinity) - (a.change ?? -Infinity));
  return { lookback, instrumentCount: instruments.length, successCount: results.filter((x) => x.change !== undefined && x.change !== null).length, failureCount: results.filter((x) => x.change === undefined || x.change === null).length, qualified: results.filter((x) => x.rising), results };
}
