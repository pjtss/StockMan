import { fetchUsDailyPrice } from "@/lib/kis-us-daily-price";
import { listStoredUsInstruments } from "@/lib/us-mfi-oversold";
import { latestMacd } from "@/lib/us-macd";

export async function scanStoredUsMacd(options: { fast?: number; slow?: number; signal?: number; concurrency?: number } = {}) {
  const fast = options.fast ?? 12, slow = options.slow ?? 26, signal = options.signal ?? 9;
  const instruments = await listStoredUsInstruments(), results: any[] = [];
  let cursor = 0;
  async function worker() { while (cursor < instruments.length) { const item = instruments[cursor++]; try { const daily = await fetchUsDailyPrice({ code: item.code, market: item.market }); const macd = daily?.ok ? latestMacd(daily.candles, fast, slow, signal) : null; results.push({ market: item.market, code: item.code, name: item.name, ...macd, candleCount: daily?.candles.length ?? 0, dailyDiagnostics: daily?.diagnostics ?? null, error: macd ? undefined : !daily ? "KIS access token unavailable" : !daily.ok ? `KIS daily API failed (${daily.status})` : "insufficient parsed candles for MACD" }); } catch (error) { results.push({ market: item.market, code: item.code, name: item.name, macd: null, signal: null, histogram: null, goldenCross: false, deathCross: false, bullish: false, candleCount: 0, error: error instanceof Error ? error.message : String(error) }); } } }
  await Promise.all(Array.from({ length: Math.min(options.concurrency ?? 4, Math.max(1, instruments.length)) }, worker));
  results.sort((a, b) => (b.histogram ?? -Infinity) - (a.histogram ?? -Infinity));
  const qualified = results.filter((item) => item.bullish);
  return { fast, slow, signal, instrumentCount: instruments.length, successCount: results.filter((item) => item.macd != null).length, failureCount: results.filter((item) => item.macd == null).length, qualified, results };
}
