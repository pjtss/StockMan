import { fetchKisUsTradeTrend, type KisUsTradeMarket } from "@/lib/kis-us-trade-trend";
import { saveUsTradeIntensityTicks } from "@/lib/us-trade-intensity-repository";

export type TradeIntensityCollectionOptions = {
  market?: KisUsTradeMarket;
  day?: "0" | "1";
  maxSymbols?: number;
  delayMs?: number;
};

export type TradeIntensityCollectionResult = {
  requestedCount: number;
  successCount: number;
  failureCount: number;
  insertedCount: number;
  duplicateCount: number;
  results: Array<{ code: string; market: string; ok: boolean; tradeCount: number; insertedCount: number; duplicateCount: number; error?: string }>;
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Collects recent execution trends and persists only deduplicated ticks. */
export async function collectUsTradeIntensity(symbols: string[], options: TradeIntensityCollectionOptions = {}): Promise<TradeIntensityCollectionResult> {
  const uniqueSymbols = Array.from(new Set(symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean))).slice(0, Math.max(1, options.maxSymbols ?? 10));
  const delayMs = Math.max(0, options.delayMs ?? 350);
  const results: TradeIntensityCollectionResult["results"] = [];
  let insertedCount = 0;
  let duplicateCount = 0;
  for (let index = 0; index < uniqueSymbols.length; index += 1) {
    const code = uniqueSymbols[index];
    try {
      const result = await fetchKisUsTradeTrend({ code, market: options.market, day: options.day ?? "1" });
      if (!result || !result.ok) {
        results.push({ code, market: result?.market ?? options.market ?? "UNRESOLVED", ok: false, tradeCount: result?.trades.length ?? 0, insertedCount: 0, duplicateCount: 0, error: result ? result.diagnostics.msg1 ?? `HTTP ${result.status}` : "KIS access token is unavailable" });
      } else {
        const saved = await saveUsTradeIntensityTicks({ market: result.market, code }, result.trades);
        insertedCount += saved.insertedCount;
        duplicateCount += saved.skippedCount;
        results.push({ code, market: result.market, ok: true, tradeCount: result.trades.length, insertedCount: saved.insertedCount, duplicateCount: saved.skippedCount });
      }
    } catch (error) {
      results.push({ code, market: options.market ?? "UNRESOLVED", ok: false, tradeCount: 0, insertedCount: 0, duplicateCount: 0, error: error instanceof Error ? error.message : String(error) });
    }
    if (index < uniqueSymbols.length - 1 && delayMs > 0) await wait(delayMs);
  }
  return { requestedCount: uniqueSymbols.length, successCount: results.filter((result) => result.ok).length, failureCount: results.filter((result) => !result.ok).length, insertedCount, duplicateCount, results };
}
