import { loadStoredUsInstrumentScopes } from "@/lib/us-top-rising-universe";
import { fetchUsDailyPrice } from "@/lib/kis-us-daily-price";
import { saveUsDailyCandles } from "@/lib/us-daily-price-cache";
import type { UsDailyCandle } from "@/lib/kis-us-daily-price";

const target = Math.max(1, Math.min(1200, Number(process.env.US_DAILY_BACKFILL_TARGET ?? 1200)));
const concurrency = Math.max(1, Math.min(4, Number(process.env.US_DAILY_BACKFILL_CONCURRENCY ?? 4)));

function previousDate(date: string) {
  const value = new Date(`${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10).replaceAll("-", "");
}

async function backfill(item: { market: string; code: string }) {
  const candles = new Map<string, UsDailyCandle>();
  let endDate: string | undefined;
  let requests = 0;
  while (candles.size < target && requests < 20) {
    const response = await fetchUsDailyPrice({ market: item.market, code: item.code, endDate, timeframe: "D" });
    requests += 1;
    if (!response?.ok || response.candles.length === 0) break;
    for (const candle of response.candles) candles.set(candle.date, candle);
    const oldest = response.candles.map((c) => c.date).sort()[0];
    if (!oldest || oldest === endDate) break;
    endDate = previousDate(oldest);
  }
  const values = [...candles.values()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, target);
  if (values.length) await saveUsDailyCandles(item.market, item.code, values, "D");
  return { market: item.market, code: item.code, candles: values.length, requests };
}

async function main() {
const universe = await loadStoredUsInstrumentScopes();
const items = universe.scopes;
let cursor = 0, completed = 0, failed = 0, saved = 0;
async function worker() {
  while (true) {
    const item = items[cursor++];
    if (!item) return;
    try {
      const result = await backfill(item);
      completed += 1; saved += result.candles;
      if (completed % 100 === 0 || completed === items.length) console.log(JSON.stringify({ completed, total: items.length, failed, saved }));
    } catch (error) {
      failed += 1;
      console.error(JSON.stringify({ market: item.market, code: item.code, error: error instanceof Error ? error.message : String(error) }));
    }
  }
}
await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
console.log(JSON.stringify({ target, concurrency, total: items.length, completed, failed, saved }));
}
main().catch((error) => { console.error(error); process.exit(1); });
