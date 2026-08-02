import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { usInstruments } from "@/lib/schema";
import { fetchUsDailyPrice } from "@/lib/kis-us-daily-price";
import { latestMfi } from "@/lib/us-mfi";

export const DEFAULT_MFI_PERIOD = 14;
export const DEFAULT_MFI_OVERSOLD_THRESHOLD = 20;
const US_MARKETS = ["NAS", "NYS", "AMS"] as const;

export type MfiOversoldResult = {
  market: string;
  code: string;
  name: string;
  mfi: number | null;
  mfiDate: string | null;
  candleCount: number;
  qualifies: boolean;
  error?: string;
};

export async function listStoredUsInstruments() {
  const db = getDb();
  if (!db) return [];
  return db.select({ id: usInstruments.id, market: usInstruments.market, code: usInstruments.code, name: usInstruments.name })
    .from(usInstruments)
    .where(and(eq(usInstruments.enabled, true), inArray(usInstruments.market, [...US_MARKETS])))
    .orderBy(asc(usInstruments.market), asc(usInstruments.code));
}

export async function scanStoredUsMfiOversold(options: { period?: number; threshold?: number; concurrency?: number } = {}) {
  const period = options.period ?? DEFAULT_MFI_PERIOD;
  const threshold = options.threshold ?? DEFAULT_MFI_OVERSOLD_THRESHOLD;
  const instruments = await listStoredUsInstruments();
  const results: MfiOversoldResult[] = [];
  const concurrency = Math.max(1, Math.min(options.concurrency ?? 4, 8));
  let cursor = 0;
  async function worker() {
    while (true) {
      const instrument = instruments[cursor++];
      if (!instrument) return;
      try {
        const daily = await fetchUsDailyPrice({ code: instrument.code, market: instrument.market });
        if (!daily?.ok) {
          results.push({ market: instrument.market, code: instrument.code, name: instrument.name, mfi: null, mfiDate: null, candleCount: daily?.candles.length ?? 0, qualifies: false, error: `daily price API failed (${daily?.status ?? 0})` });
          continue;
        }
        const latest = latestMfi(daily.candles, period);
        if (!latest) {
          results.push({ market: instrument.market, code: instrument.code, name: instrument.name, mfi: null, mfiDate: null, candleCount: daily.candles.length, qualifies: false, error: `fewer than ${period + 1} daily candles` });
          continue;
        }
        results.push({ market: instrument.market, code: instrument.code, name: instrument.name, mfi: latest.value, mfiDate: latest.date, candleCount: daily.candles.length, qualifies: latest.value <= threshold });
      } catch (error) {
        results.push({ market: instrument.market, code: instrument.code, name: instrument.name, mfi: null, mfiDate: null, candleCount: 0, qualifies: false, error: error instanceof Error ? error.message : String(error) });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, instruments.length || 1) }, () => worker()));
  results.sort((a, b) => (a.mfi ?? 101) - (b.mfi ?? 101) || a.market.localeCompare(b.market) || a.code.localeCompare(b.code));
  return { period, threshold, instrumentCount: instruments.length, successCount: results.filter((item) => item.mfi !== null).length, failureCount: results.filter((item) => item.mfi === null).length, qualified: results.filter((item) => item.qualifies), results };
}
