import { loadStoredKrInstrumentScopes } from "@/lib/kr-instruments";
import { fetchKrMinuteCandles, saveKrMinuteCandles } from "@/lib/kr-minute-candle-cache";

export async function refreshKrCommonMinuteCandles(options: { limit?: number; concurrency?: number; onProgress?: (progress: { completed: number; total: number; saved: number; failed: number }) => void } = {}) {
  const limit = Math.min(1200, Math.max(30, options.limit ?? 1200));
  const concurrency = Math.max(1, Math.min(8, options.concurrency ?? 4));
  const { scopes } = await loadStoredKrInstrumentScopes();
  let cursor = 0, completed = 0, saved = 0, failed = 0;
  const errors: Array<{ market: string; code: string; error: string }> = [];
  async function worker() {
    while (true) {
      const item = scopes[cursor++]; if (!item) return;
      try { const rows = await fetchKrMinuteCandles(item.code, limit, item.market); saved += await saveKrMinuteCandles(item.market, item.code, rows); }
      catch (error) { failed++; errors.push({ market: item.market, code: item.code, error: error instanceof Error ? error.message : String(error) }); }
      completed++; options.onProgress?.({ completed, total: scopes.length, saved, failed });
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, scopes.length) }, () => worker()));
  return { ok: failed === 0, total: scopes.length, completed, saved, failed, errors: errors.slice(0, 100), limit, concurrency };
}
