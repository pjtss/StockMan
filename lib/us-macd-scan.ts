import { fetchUsDailyPriceCached, loadCachedUsDailyCandlesBulk } from "@/lib/us-daily-price-cache";
import { loadUsTopRisingScopes } from "@/lib/us-top-rising-universe";
import { latestMacd } from "@/lib/us-macd";

export async function scanStoredUsMacd(options: { fast?: number; slow?: number; signal?: number; concurrency?: number } = {}) {
  const fast = options.fast ?? 12, slow = options.slow ?? 26, signal = options.signal ?? 9;
  const universe = await loadUsTopRisingScopes();
  const instruments = universe.scopes, results: any[] = [];
  const requiredCandles = slow + signal;
  const cachedCandles = await loadCachedUsDailyCandlesBulk(instruments, requiredCandles).catch(() => new Map<string, any[]>());
  const getDaily = (item: (typeof instruments)[number]) => {
    const cached = cachedCandles.get(`${item.market}:${item.code}`);
    return cached && cached.length >= requiredCandles
      ? Promise.resolve({ ok: true, status: 200, candles: cached, diagnostics: { source: "DB_CACHE_BULK", parsedCandleCount: cached.length } })
      : fetchUsDailyPriceCached({ code: item.code, market: item.market }, requiredCandles);
  };
  let cursor = 0;
  async function worker() { while (cursor < instruments.length) {
    const item = instruments[cursor++];
    try {
      const daily = await getDaily(item);
      const macd = daily?.ok ? latestMacd(daily.candles, fast, slow, signal) : null;
      results.push({ market: item.market, code: item.code, name: item.name, ...macd, candleCount: daily?.candles.length ?? 0, dailyDiagnostics: daily?.diagnostics ?? null, rawText: daily?.response?.rawText || undefined, error: macd ? undefined : !daily ? "KIS access token unavailable" : !daily.ok ? `KIS daily API failed (${daily.status})` : "insufficient parsed candles for MACD" });
    } catch (error) { results.push({ market: item.market, code: item.code, name: item.name, macd: null, signal: null, histogram: null, goldenCross: false, deathCross: false, bullish: false, candleCount: 0, error: error instanceof Error ? error.message : String(error) }); }
  } }
  await Promise.all(Array.from({ length: Math.min(options.concurrency ?? 4, Math.max(1, instruments.length)) }, worker));
  results.sort((a, b) => (b.histogram ?? -Infinity) - (a.histogram ?? -Infinity));
  return { universeAvailable: Boolean((universe.universe as any).ok), universe: universe.universe, fast, slow, signal, instrumentCount: instruments.length, successCount: results.filter((item) => item.macd != null).length, failureCount: results.filter((item) => item.macd == null).length, qualified: results.filter((item) => item.bullish), results };
}
