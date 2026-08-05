import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { usInstruments } from "@/lib/schema";
import { fetchUsDailyPriceCached, loadCachedUsDailyCandlesBulk } from "@/lib/us-daily-price-cache";
import { latestMfi } from "@/lib/us-mfi";
import { getMfiThreshold } from "@/lib/automation-settings";
import { loadUsTopRisingScopes } from "@/lib/us-top-rising-universe";

export const DEFAULT_MFI_PERIOD = 14;
export const DEFAULT_MFI_OVERSOLD_THRESHOLD = 30;
const US_MARKETS = ["NAS", "NYS", "AMS"] as const;

export type MfiOversoldResult = {
  market: string;
  code: string;
  name: string;
  mfi: number | null;
  mfiDate: string | null;
  candleCount: number;
  qualifies: boolean;
  httpStatus?: number;
  rtCd?: unknown;
  msgCd?: unknown;
  msg1?: unknown;
  rawText?: string | null;
  rawOutputCount?: number;
  dailyDiagnostics?: unknown;
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
  const threshold = options.threshold ?? await getMfiThreshold();
  const universe = await loadUsTopRisingScopes();
  const instruments = universe.scopes;
  const cachedCandles = await loadCachedUsDailyCandlesBulk(instruments, period + 1).catch(() => new Map<string, any[]>());
  const results: MfiOversoldResult[] = [];
  // KIS rate limits are shared across the instance; serialize daily requests
  // by default so a full-table diagnostic does not turn into 500 responses.
  const concurrency = Math.max(1, Math.min(options.concurrency ?? 1, 2));
  let cursor = 0;
  let lastRequestAt = 0;
  async function worker() {
    while (true) {
      const instrument = instruments[cursor++];
      if (!instrument) return;
      try {
        const wait = Math.max(0, 300 - (Date.now() - lastRequestAt));
        if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
        lastRequestAt = Date.now();
        const prefetched = cachedCandles.get(`${instrument.market}:${instrument.code}`);
        const daily = prefetched && prefetched.length >= period + 1
          ? { ok: true, status: 200, candles: prefetched, response: { rawText: "", parsed: null }, diagnostics: { source: "DB_CACHE_BULK", parsedCandleCount: prefetched.length } }
          : await fetchUsDailyPriceCached({ code: instrument.code, market: instrument.market }, period + 1);
        if (!daily?.ok) {
          const parsed = daily?.response.parsed as { rt_cd?: unknown; msg_cd?: unknown; msg1?: unknown; output?: unknown; output2?: unknown } | null;
          results.push({ market: instrument.market, code: instrument.code, name: instrument.name ?? "", mfi: null, mfiDate: null, candleCount: daily?.candles.length ?? 0, qualifies: false, error: `daily price API failed (${daily?.status ?? 0})`, httpStatus: daily?.status, rtCd: parsed?.rt_cd ?? null, msgCd: parsed?.msg_cd ?? null, msg1: parsed?.msg1 ?? null, rawOutputCount: Array.isArray(parsed?.output) ? parsed.output.length : Array.isArray(parsed?.output2) ? parsed.output2.length : 0, rawText: daily?.response.rawText.slice(0, 1000) ?? null });
          continue;
        }
        const latest = latestMfi(daily.candles, period);
        if (!latest) {
          const parsed = daily.response.parsed as { rt_cd?: unknown; msg_cd?: unknown; msg1?: unknown; output?: unknown; output2?: unknown } | null;
          results.push({ market: instrument.market, code: instrument.code, name: instrument.name ?? "", mfi: null, mfiDate: null, candleCount: daily.candles.length, qualifies: false, error: `fewer than ${period + 1} daily candles`, httpStatus: daily.status, rtCd: parsed?.rt_cd ?? null, msgCd: parsed?.msg_cd ?? null, msg1: parsed?.msg1 ?? null, rawOutputCount: Array.isArray(parsed?.output) ? parsed.output.length : Array.isArray(parsed?.output2) ? parsed.output2.length : 0 });
          continue;
        }
        results.push({ market: instrument.market, code: instrument.code, name: instrument.name ?? "", mfi: latest.value, mfiDate: latest.date, candleCount: daily.candles.length, dailyDiagnostics: daily.diagnostics, qualifies: latest.value <= threshold });
      } catch (error) {
        results.push({ market: instrument.market, code: instrument.code, name: instrument.name ?? "", mfi: null, mfiDate: null, candleCount: 0, qualifies: false, error: error instanceof Error ? error.message : String(error) });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, instruments.length || 1) }, () => worker()));
  results.sort((a, b) => (a.mfi ?? 101) - (b.mfi ?? 101) || a.market.localeCompare(b.market) || a.code.localeCompare(b.code));
  return { universe: universe.universe, period, threshold, instrumentCount: instruments.length, successCount: results.filter((item) => item.mfi !== null).length, failureCount: results.filter((item) => item.mfi === null).length, qualified: results.filter((item) => item.qualifies), results };
}
