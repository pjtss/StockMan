import { loadStoredUsInstrumentScopes } from "@/lib/us-top-rising-universe";
import { fetchUsDailyPrice } from "@/lib/kis-us-daily-price";
import { saveUsDailyCandles } from "@/lib/us-daily-price-cache";
import type { UsDailyCandle } from "@/lib/kis-us-daily-price";
import { getBackfillRunError, mergeBackfillPage, parseBoundedIntegerSetting } from "./daily-cache-backfill-control.mjs";

const target = parseBoundedIntegerSetting("US_DAILY_BACKFILL_TARGET", process.env.US_DAILY_BACKFILL_TARGET, 1200, 1, 1200);
const concurrency = parseBoundedIntegerSetting("US_DAILY_BACKFILL_CONCURRENCY", process.env.US_DAILY_BACKFILL_CONCURRENCY, 4, 1, 4);
const maxRequestsPerInstrument = 20;

function previousDate(date: string) {
  const value = new Date(`${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10).replaceAll("-", "");
}

async function backfill(item: { market: string; code: string }) {
  const candles = new Map<string, UsDailyCandle>();
  let endDate: string | undefined;
  let requests = 0;
  let error: string | null = null;
  while (candles.size < target && requests < maxRequestsPerInstrument) {
    const response = await fetchUsDailyPrice({ market: item.market, code: item.code, endDate, timeframe: "D" });
    requests += 1;
    if (!response?.ok) {
      error = response?.diagnostics?.msg1 ?? "DAILY_PAGE_FETCH_FAILED";
      break;
    }
    if (!Array.isArray(response.candles) || response.candles.length === 0) break;
    const addedCount = mergeBackfillPage(candles, response.candles);
    const oldest = response.candles.map((c) => c.date).sort()[0];
    if (!oldest) break;
    if (addedCount === 0) {
      error = "DAILY_PAGE_PAGINATION_STALLED";
      break;
    }
    endDate = previousDate(oldest);
  }
  if (!error && candles.size < target && requests >= maxRequestsPerInstrument) error = "DAILY_PAGE_REQUEST_LIMIT_REACHED";
  const values = [...candles.values()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, target);
  const savedCandleCount = values.length ? await saveUsDailyCandles(item.market, item.code, values, "D") : 0;
  return { market: item.market, code: item.code, fetchedCandleCount: values.length, savedCandleCount, requests, error };
}

async function main() {
const universe = await loadStoredUsInstrumentScopes();
const items = universe.scopes;
if (items.length === 0) throw new Error("US_DAILY_BACKFILL_EMPTY_UNIVERSE");
let cursor = 0, completed = 0, failed = 0, saved = 0;
async function worker() {
  while (true) {
    const item = items[cursor++];
    if (!item) return;
    try {
      const result = await backfill(item);
      saved += result.savedCandleCount;
      if (result.savedCandleCount === 0 || result.error) {
        failed += 1;
        console.error(JSON.stringify({ market: item.market, code: item.code, error: result.error ?? "no valid daily candles saved", fetchedCandleCount: result.fetchedCandleCount, savedCandleCount: result.savedCandleCount, requests: result.requests }));
      } else {
        completed += 1;
      }
      if ((completed + failed) % 100 === 0 || completed + failed === items.length) console.log(JSON.stringify({ completed, total: items.length, failed, saved }));
    } catch (error) {
      failed += 1;
      console.error(JSON.stringify({ market: item.market, code: item.code, error: error instanceof Error ? error.message : String(error) }));
    }
  }
}
await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
console.log(JSON.stringify({ target, concurrency, total: items.length, completed, failed, saved }));
const completionError = getBackfillRunError(items.length, failed);
if (completionError) throw new Error(completionError);
}
main().catch((error) => { console.error(error); process.exit(1); });
