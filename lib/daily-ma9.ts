import { loadCachedKrDailyCandlesBulk } from "@/lib/kr-daily-price-cache";
import { loadStoredKrInstrumentScopes } from "@/lib/kr-instruments";
import { loadCachedUsDailyCandlesBulk } from "@/lib/us-daily-price-cache";
import { loadStoredUsInstrumentScopes } from "@/lib/us-top-rising-universe";

export type DailyMa9Market = "KR" | "US";

export type DailyMa9Result = {
  market: string;
  code: string;
  name: string;
  status: "ABOVE_MA9" | "NOT_ABOVE_MA9" | "INSUFFICIENT_HISTORY" | "FAILED";
  qualifies: boolean;
  candleCount: number;
  latestCandleDate: string | null;
  close: number | null;
  ma9: number | null;
  distancePercent: number | null;
  error?: string;
};

function evaluate(candles: Array<{ date: string; close: number }>, item: { market: string; code: string; name?: string }): DailyMa9Result {
  const rows = candles
    .filter((candle) => Number.isFinite(candle.close) && candle.close > 0 && candle.date)
    .sort((a, b) => b.date.localeCompare(a.date));
  if (rows.length < 9) {
    return { market: item.market, code: item.code, name: item.name ?? "", status: "INSUFFICIENT_HISTORY", qualifies: false, candleCount: rows.length, latestCandleDate: rows[0]?.date ?? null, close: rows[0]?.close ?? null, ma9: null, distancePercent: null, error: `insufficient valid candles (${rows.length}/9)` };
  }
  const latest = rows[0];
  const ma9 = rows.slice(0, 9).reduce((sum, candle) => sum + candle.close, 0) / 9;
  const distancePercent = ma9 === 0 ? null : ((latest.close - ma9) / Math.abs(ma9)) * 100;
  const qualifies = latest.close > ma9;
  return { market: item.market, code: item.code, name: item.name ?? "", status: qualifies ? "ABOVE_MA9" : "NOT_ABOVE_MA9", qualifies, candleCount: rows.length, latestCandleDate: latest.date, close: latest.close, ma9: Number(ma9.toFixed(6)), distancePercent: distancePercent == null ? null : Number(distancePercent.toFixed(4)) };
}

async function scanKr(): Promise<{ market: DailyMa9Market; universe: unknown; results: DailyMa9Result[] }> {
  const universe = await loadStoredKrInstrumentScopes();
  const candles = await loadCachedKrDailyCandlesBulk(universe.scopes, 9, "D");
  const results = universe.scopes.map((item) => {
    try { return evaluate(candles.get(`${item.market}:${item.code}`) ?? [], item); }
    catch (error) { return { market: item.market, code: item.code, name: item.name, status: "FAILED" as const, qualifies: false, candleCount: 0, latestCandleDate: null, close: null, ma9: null, distancePercent: null, error: error instanceof Error ? error.message : String(error) }; }
  });
  return { market: "KR", universe: universe.universe, results };
}

async function scanUs(): Promise<{ market: DailyMa9Market; universe: unknown; results: DailyMa9Result[] }> {
  const universe = await loadStoredUsInstrumentScopes();
  const candles = await loadCachedUsDailyCandlesBulk(universe.scopes, 9, "D");
  const results = universe.scopes.map((item) => {
    try { return evaluate(candles.get(`${item.market}:${item.code}`) ?? [], item); }
    catch (error) { return { market: item.market, code: item.code, name: item.name ?? "", status: "FAILED" as const, qualifies: false, candleCount: 0, latestCandleDate: null, close: null, ma9: null, distancePercent: null, error: error instanceof Error ? error.message : String(error) }; }
  });
  return { market: "US", universe: universe.universe, results };
}

export async function scanDailyMa9(market: DailyMa9Market | "BOTH" = "BOTH") {
  const startedAt = Date.now();
  const scans = await Promise.all(market === "KR" ? [scanKr()] : market === "US" ? [scanUs()] : [scanKr(), scanUs()]);
  const results = scans.flatMap((scan) => scan.results).sort((a, b) => Number(b.qualifies) - Number(a.qualifies) || a.market.localeCompare(b.market) || a.code.localeCompare(b.code));
  return {
    ok: true,
    checkedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    market,
    policy: { timeframe: "D", period: 9, rule: "최근 저장 일봉 종가 > 최근 9개 일봉 종가 단순이동평균" },
    dataPolicy: { source: "*_instrument_universe_candles", currentDayIncluded: true, productFilter: "공식 종목 마스터의 COMMON_STOCK만 사용", marketCapFilter: false },
    universes: scans.map((scan) => ({ market: scan.market, ...scan.universe as object })),
    instrumentCount: results.length,
    successCount: results.filter((r) => r.status !== "FAILED" && r.status !== "INSUFFICIENT_HISTORY").length,
    failureCount: results.filter((r) => r.status === "FAILED" || r.status === "INSUFFICIENT_HISTORY").length,
    statistics: { aboveMa9: results.filter((r) => r.status === "ABOVE_MA9").length, notAboveMa9: results.filter((r) => r.status === "NOT_ABOVE_MA9").length, insufficientHistory: results.filter((r) => r.status === "INSUFFICIENT_HISTORY").length, failed: results.filter((r) => r.status === "FAILED").length },
    qualified: results.filter((r) => r.qualifies),
    results,
  };
}

export { evaluate as evaluateDailyMa9 };
