import { fetchUsDailyPrice } from "@/lib/kis-us-daily-price";
import { saveUsDailyCandles } from "@/lib/us-daily-price-cache";
import { currentUsMarketDate, dateKey } from "@/lib/us-market-date";
import { loadStoredUsInstrumentScopes } from "@/lib/us-top-rising-universe";

type OpenCacheFailure = { market: string; code: string; error: string; status?: number };

let activeRefresh: Promise<Awaited<ReturnType<typeof executeRefresh>>> | null = null;

async function executeRefresh(options: { concurrency?: number } = {}) {
  const startedAt = new Date().toISOString();
  const marketDate = currentUsMarketDate();
  const universe = await loadStoredUsInstrumentScopes();
  const instruments = universe.scopes;
  const concurrency = Math.max(1, Math.min(Math.floor(options.concurrency ?? 4), 8));
  const failures: OpenCacheFailure[] = [];
  let cursor = 0;
  let successCount = 0;
  let updatedCandleCount = 0;
  let currentCandleCount = 0;

  async function worker() {
    while (true) {
      const item = instruments[cursor++];
      if (!item) return;
      try {
        const daily = await fetchUsDailyPrice({ code: item.code, market: item.market, endDate: marketDate });
        if (!daily?.ok) {
          failures.push({ market: item.market, code: item.code, status: daily?.status, error: !daily ? "KIS access token unavailable" : `KIS daily API failed (${daily.status})` });
          continue;
        }
        const current = daily.candles.find((candle) => dateKey(candle.date) === marketDate);
        if (!current) {
          failures.push({ market: item.market, code: item.code, status: daily.status, error: `current US market candle unavailable (${marketDate})` });
          continue;
        }
        currentCandleCount += 1;
        updatedCandleCount += await saveUsDailyCandles(item.market, item.code, [current]);
        successCount += 1;
      } catch (error) {
        failures.push({ market: item.market, code: item.code, error: error instanceof Error ? error.message : String(error) });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, instruments.length)) }, () => worker()));
  return {
    universeAvailable: Boolean((universe.universe as any).ok),
    universe: universe.universe,
    marketDate,
    startedAt,
    completedAt: new Date().toISOString(),
    instrumentCount: instruments.length,
    concurrency,
    successCount,
    failureCount: failures.length,
    currentCandleCount,
    updatedCandleCount,
    failures,
  };
}

/** Refreshes only the current US-session candle. Historical candles are untouched. */
export function refreshUsDailyOpenCache(options: { concurrency?: number } = {}) {
  if (!activeRefresh) activeRefresh = executeRefresh(options).finally(() => { activeRefresh = null; });
  return activeRefresh;
}
