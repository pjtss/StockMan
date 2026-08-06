import { loadCachedUsDailyCandlesBulk } from "@/lib/us-daily-price-cache";
import { latestDmi } from "@/lib/us-dmi";
import { loadUsTopRisingScopes } from "@/lib/us-top-rising-universe";

export async function scanStoredUsDmi(options: { period?: number; concurrency?: number } = {}) {
  const period = options.period ?? 14;
  const universe = await loadUsTopRisingScopes();
  const instruments = universe.scopes;
  const results: any[] = [];
  const cachedCandles = await loadCachedUsDailyCandlesBulk(instruments, period + 1).catch(() => new Map<string, any[]>());
  const getDaily = (item: (typeof instruments)[number]) => {
    const cached = cachedCandles.get(`${item.market}:${item.code}`);
    return cached && cached.length >= period + 1
      ? Promise.resolve({ ok: true, status: 200, candles: cached, diagnostics: { source: "DB_CACHE_BULK", parsedCandleCount: cached.length } })
      : Promise.resolve({ ok: false, status: 0, candles: cached ?? [], response: { rawText: "", parsed: null }, diagnostics: { source: "DB_CACHE_ONLY", parsedCandleCount: cached?.length ?? 0 } });
  };
  let cursor = 0;
  const worker = async () => { while (cursor < instruments.length) {
    const item = instruments[cursor++];
    try {
      const daily = await getDaily(item);
      const dmi = daily?.ok ? latestDmi(daily.candles, period) : null;
      results.push({ market: item.market, code: item.code, name: item.name, plusDi: dmi?.plusDi ?? null, minusDi: dmi?.minusDi ?? null, adx: dmi?.adx ?? null, date: dmi?.date ?? null, candleCount: daily?.candles.length ?? 0, dailyDiagnostics: daily?.diagnostics ?? null, rawText: (daily as any)?.response?.rawText || undefined, qualifies: Boolean(dmi && dmi.plusDi > dmi.minusDi), error: dmi ? undefined : !daily ? "KIS access token unavailable" : !daily.ok ? `KIS daily API failed (${daily.status})` : "insufficient parsed candles for DMI" });
    } catch (error) { results.push({ market: item.market, code: item.code, name: item.name, plusDi: null, minusDi: null, adx: null, date: null, candleCount: 0, qualifies: false, error: error instanceof Error ? error.message : String(error) }); }
  } };
  await Promise.all(Array.from({ length: Math.min(options.concurrency ?? 4, Math.max(1, instruments.length)) }, worker));
  results.sort((a, b) => (b.adx ?? -1) - (a.adx ?? -1));
  return { universeAvailable: Boolean((universe.universe as any).ok), universe: universe.universe, period, instrumentCount: instruments.length, successCount: results.filter((x) => x.adx !== null).length, failureCount: results.filter((x) => x.adx === null).length, qualified: results.filter((x) => x.qualifies), results };
}
