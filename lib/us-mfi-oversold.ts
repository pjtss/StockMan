import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { usInstrumentUniverse } from "@/lib/schema";
import { createUsDailyScanContext, type UsDailyScanContext } from "@/lib/us-daily-scan-context";
import { latestMfi } from "@/lib/us-mfi";
import { getMfiThreshold } from "@/lib/automation-settings";
import { loadStoredUsInstrumentScopes } from "@/lib/us-top-rising-universe";

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
  return db.select({ id: usInstrumentUniverse.id, market: usInstrumentUniverse.market, code: usInstrumentUniverse.code, name: usInstrumentUniverse.name })
    .from(usInstrumentUniverse)
    .where(and(eq(usInstrumentUniverse.enabled, true), inArray(usInstrumentUniverse.market, [...US_MARKETS]), eq(usInstrumentUniverse.isEtf, false), eq(usInstrumentUniverse.isLeveraged, false), eq(usInstrumentUniverse.isInverse, false), eq(usInstrumentUniverse.isWarrant, false), eq(usInstrumentUniverse.isDerivative, false)))
    .orderBy(asc(usInstrumentUniverse.market), asc(usInstrumentUniverse.code));
}

export async function scanStoredUsMfiOversold(options: { period?: number; threshold?: number; concurrency?: number; context?: UsDailyScanContext } = {}) {
  const period = options.period ?? DEFAULT_MFI_PERIOD;
  const threshold = options.threshold ?? await getMfiThreshold();
  const context = options.context ?? await createUsDailyScanContext({ candleLimit: period + 1 });
  const universe = context.universe;
  const instruments = universe.scopes;
  const cachedCandles = context.candles;
  const results: MfiOversoldResult[] = [];
  // This scanner reads the prefetched DB cache only. There is no KIS request
  // in the worker, so applying an API rate-limit delay here would make a
  // full-table admin diagnostic exceed the reverse-proxy timeout.
  const concurrency = Math.max(1, Math.min(options.concurrency ?? 4, 8));
  let cursor = 0;
  async function worker() {
    while (true) {
      const instrument = instruments[cursor++];
      if (!instrument) return;
      try {
        const prefetched = cachedCandles.get(`${instrument.market}:${instrument.code}`) ?? [];
        const daily = prefetched && prefetched.length >= period + 1
          ? { ok: true, status: 200, candles: prefetched, response: { rawText: "", parsed: null }, diagnostics: { source: "DB_CACHE_BULK", parsedCandleCount: prefetched.length } }
          : { ok: false, status: 0, candles: prefetched ?? [], response: { rawText: "", parsed: null }, diagnostics: { source: "DB_CACHE_ONLY", parsedCandleCount: prefetched?.length ?? 0 } };
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
        results.push({ market: instrument.market, code: instrument.code, name: instrument.name ?? "", mfi: latest.value, mfiDate: latest.date, candleCount: daily.candles.length, dailyDiagnostics: daily.diagnostics, rawText: daily.response.rawText || undefined, qualifies: latest.value <= threshold });
      } catch (error) {
        results.push({ market: instrument.market, code: instrument.code, name: instrument.name ?? "", mfi: null, mfiDate: null, candleCount: 0, qualifies: false, error: error instanceof Error ? error.message : String(error) });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, instruments.length || 1) }, () => worker()));
  results.sort((a, b) => (a.mfi ?? 101) - (b.mfi ?? 101) || a.market.localeCompare(b.market) || a.code.localeCompare(b.code));
  return { universeAvailable: Boolean((universe.universe as any).ok), universe: universe.universe, period, threshold, instrumentCount: instruments.length, successCount: results.filter((item) => item.mfi !== null).length, failureCount: results.filter((item) => item.mfi === null).length, qualified: results.filter((item) => item.qualifies), results };
}
