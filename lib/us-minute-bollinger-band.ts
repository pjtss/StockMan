import { fetchUsMinuteTurnover } from "@/lib/kis-us-minute-turnover";
import { loadUsTopRisingScopes } from "@/lib/us-top-rising-universe";
import { loadFeatureModuleSettings } from "@/lib/feature-module-settings";

export type UsMinuteBollingerPolicy = { topN: number; period: number; stdDevMultiplier: number; minChangeRate: number };
export type UsMinuteBollingerResult = { market: string; code: string; name: string; rank: number; changeRate: number | null; pointCount: number; currentPrice: number | null; middle: number | null; upper: number | null; lower: number | null; qualifies: boolean; status: "QUALIFIED" | "NOT_TOUCHING" | "FAILED"; error?: string };

function bands(values: number[], period: number, multiplier: number) {
  if (values.length < period) return null;
  const window = values.slice(-period); const middle = window.reduce((a, b) => a + b, 0) / period;
  const deviation = Math.sqrt(window.reduce((sum, value) => sum + (value - middle) ** 2, 0) / period);
  return { middle, upper: middle + multiplier * deviation, lower: middle - multiplier * deviation };
}

export async function scanUsMinuteBollingerBands(options: { policy?: Partial<UsMinuteBollingerPolicy>; concurrency?: number } = {}) {
  const settings = await loadFeatureModuleSettings("us-minute-bollinger-band");
  const configured = settings.featureSettings?.minuteBollingerPolicy as Partial<UsMinuteBollingerPolicy> | undefined;
  const policy = { topN: Math.max(1, Math.min(100, Math.floor(Number(options.policy?.topN ?? configured?.topN ?? 30)))), period: Math.max(2, Math.floor(Number(options.policy?.period ?? configured?.period ?? 20))), stdDevMultiplier: Math.max(0.1, Number(options.policy?.stdDevMultiplier ?? configured?.stdDevMultiplier ?? 2)), minChangeRate: Number(options.policy?.minChangeRate ?? configured?.minChangeRate ?? 0) };
  const universe = await loadUsTopRisingScopes();
  const scopes = universe.scopes.filter((scope) => (scope.rank ?? 999) <= policy.topN && (scope.changeRate ?? 0) >= policy.minChangeRate);
  const results: UsMinuteBollingerResult[] = []; let cursor = 0; const concurrency = Math.max(1, Math.min(options.concurrency ?? 4, 8));
  async function worker() { while (true) { const scope = scopes[cursor++]; if (!scope) return; try { const response = await fetchUsMinuteTurnover({ code: scope.code, market: scope.market }); const points = response?.points ?? []; const values = points.map((point) => point.price).filter((value) => Number.isFinite(value) && value > 0); const calculated = bands(values, policy.period, policy.stdDevMultiplier); const currentPrice = values.at(-1) ?? null; const qualifies = Boolean(calculated && currentPrice != null && currentPrice <= calculated.lower); results.push({ market: scope.market, code: scope.code, name: scope.name ?? "", rank: scope.rank ?? 0, changeRate: scope.changeRate ?? null, pointCount: values.length, currentPrice, middle: calculated?.middle ?? null, upper: calculated?.upper ?? null, lower: calculated?.lower ?? null, qualifies, status: !calculated ? "FAILED" : qualifies ? "QUALIFIED" : "NOT_TOUCHING", error: !calculated ? `insufficient valid 1-minute candles (${values.length}/${policy.period})` : undefined }); } catch (error) { results.push({ market: scope.market, code: scope.code, name: scope.name ?? "", rank: scope.rank ?? 0, changeRate: scope.changeRate ?? null, pointCount: 0, currentPrice: null, middle: null, upper: null, lower: null, qualifies: false, status: "FAILED", error: error instanceof Error ? error.message : String(error) }); } } }
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, scopes.length)) }, worker));
  results.sort((a, b) => Number(b.qualifies) - Number(a.qualifies) || a.market.localeCompare(b.market) || a.rank - b.rank);
  return { ok: universe.universe.ok, checkedAt: new Date().toISOString(), policy, universe: universe.universe, instrumentCount: scopes.length, successCount: results.filter((item) => item.status !== "FAILED").length, failureCount: results.filter((item) => item.status === "FAILED").length, qualified: results.filter((item) => item.qualifies), results };
}
