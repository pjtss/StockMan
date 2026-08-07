import { loadStoredUsInstrumentScopes } from "@/lib/us-top-rising-universe";
import { fetchUsDailyPrice } from "@/lib/kis-us-daily-price";
import { saveUsDailyCandles } from "@/lib/us-daily-price-cache";

let activeWarm: Promise<Awaited<ReturnType<typeof executeWarm>>> | null = null;
function currentKstDate() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date()).replaceAll("-", ""); }

async function executeWarm(options: { concurrency?: number } = {}) {
  const startedAt = new Date().toISOString();
  const universe = await loadStoredUsInstrumentScopes();
  const instruments = universe.scopes;
  const concurrency = Math.max(1, Math.min(Math.floor(options.concurrency ?? 4), 8));
  let cursor = 0;
  let successCount = 0;
  let candleCount = 0;
  const failures: Array<{ market: string; code: string; error: string }> = [];
  async function worker() {
    while (true) {
      const item = instruments[cursor++];
      if (!item) return;
      try {
        const daily = await fetchUsDailyPrice({ code: item.code, market: item.market });
        if (!daily?.ok || daily.candles.length === 0) {
          failures.push({ market: item.market, code: item.code, error: !daily ? "KIS access token unavailable" : !daily.ok ? `KIS daily API failed (${daily.status})` : "KIS returned no daily candles" });
          continue;
        }
        const today = currentKstDate();
        const historicalCandles = daily.candles.filter((candle) => String(candle.date).replace(/[^0-9]/g, "") !== today);
        if (historicalCandles.length === 0) {
          failures.push({ market: item.market, code: item.code, error: "KIS returned no prior-day candles after excluding current date" });
          continue;
        }
        candleCount += await saveUsDailyCandles(item.market, item.code, historicalCandles);
        successCount += 1;
      } catch (error) { failures.push({ market: item.market, code: item.code, error: error instanceof Error ? error.message : String(error) }); }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, instruments.length)) }, worker));
  return { universeAvailable: Boolean((universe.universe as any).ok), universe: universe.universe, startedAt, completedAt: new Date().toISOString(), instrumentCount: instruments.length, concurrency, successCount, failureCount: failures.length, savedCandleCount: candleCount, failures };
}

export function warmUsDailyPriceCache(options: { concurrency?: number } = {}) {
  if (!activeWarm) activeWarm = executeWarm(options).finally(() => { activeWarm = null; });
  return activeWarm;
}
