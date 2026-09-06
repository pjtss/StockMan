import { loadAccumulationInstruments } from "./accumulation-repository";
import { evaluateAccumulationScan, normalizeAccumulationOptions, type AccumulationOptions } from "./accumulation-scan";
import type { AccumulationRegion } from "./accumulation-session";

type AccumulationRun = ReturnType<typeof evaluateAccumulationScan> & { timings: { loadMs: number; evaluateMs: number; totalMs: number } };
const activeScans = new Map<string, Promise<AccumulationRun>>();
const completedScans = new Map<string, { expiresAt: number; report: AccumulationRun }>();
const RESULT_CACHE_TTL_MS = 15_000;
const RESULT_CACHE_MAX_ENTRIES = 32;

function scanKey(region: AccumulationRegion, settings: ReturnType<typeof normalizeAccumulationOptions>) {
  return [region, settings.limit, settings.minRvol, settings.minScore, Math.floor(settings.asOf.getTime() / 60000)].join(":");
}

export async function runAccumulationScreener(region: AccumulationRegion, options: AccumulationOptions = {}): Promise<AccumulationRun> {
  const settings = normalizeAccumulationOptions(options);
  const key = scanKey(region, settings);
  if (process.env.NODE_ENV !== "test") {
    const cached = completedScans.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.report;
    if (cached) completedScans.delete(key);
  }
  const existing = activeScans.get(key);
  if (existing) return existing;
  const started = performance.now();
  const work = (async () => {
    const instruments = await loadAccumulationInstruments(region, settings.asOf);
    const loaded = performance.now();
    const report = evaluateAccumulationScan(region, instruments, settings);
    const finished = performance.now();
    return { ...report, timings: { loadMs: Math.round(loaded - started), evaluateMs: Math.round(finished - loaded), totalMs: Math.round(finished - started) } };
  })();
  activeScans.set(key, work);
  try {
    const report = await work;
    if (process.env.NODE_ENV !== "test") {
      completedScans.set(key, { expiresAt: Date.now() + RESULT_CACHE_TTL_MS, report });
      while (completedScans.size > RESULT_CACHE_MAX_ENTRIES) completedScans.delete(completedScans.keys().next().value!);
    }
    return report;
  } finally { activeScans.delete(key); }
}
