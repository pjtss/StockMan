import { fetchUsDailyPriceCached } from "@/lib/us-daily-price-cache";
import { latestDmi } from "@/lib/us-dmi";
import { listStoredUsInstruments } from "@/lib/us-mfi-oversold";

export async function scanStoredUsDmi(options: { period?: number; concurrency?: number } = {}) {
  const period = options.period ?? 14, instruments = await listStoredUsInstruments(), results: any[] = [];
  let cursor = 0; const worker = async () => { while (cursor < instruments.length) { const item = instruments[cursor++]; try { const daily = await fetchUsDailyPriceCached({ code: item.code, market: item.market }, period + 1); const dmi = daily?.ok ? latestDmi(daily.candles, period) : null; results.push({ market: item.market, code: item.code, name: item.name, plusDi: dmi?.plusDi ?? null, minusDi: dmi?.minusDi ?? null, adx: dmi?.adx ?? null, date: dmi?.date ?? null, candleCount: daily?.candles.length ?? 0, dailyDiagnostics: daily?.diagnostics ?? null, qualifies: Boolean(dmi && dmi.plusDi > dmi.minusDi), error: dmi ? undefined : !daily ? "KIS access token unavailable" : !daily.ok ? `KIS daily API failed (${daily.status})` : "insufficient parsed candles for DMI" }); } catch (error) { results.push({ market: item.market, code: item.code, name: item.name, plusDi: null, minusDi: null, adx: null, date: null, candleCount: 0, qualifies: false, error: error instanceof Error ? error.message : String(error) }); } } };
  await Promise.all(Array.from({ length: Math.min(options.concurrency ?? 4, Math.max(1, instruments.length)) }, worker));
  results.sort((a, b) => (b.adx ?? -1) - (a.adx ?? -1));
  return { period, instrumentCount: instruments.length, successCount: results.filter((x) => x.adx !== null).length, failureCount: results.filter((x) => x.adx === null).length, qualified: results.filter((x) => x.qualifies), results };
}
