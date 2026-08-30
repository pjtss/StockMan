import type { ScreenerFilter, ScreenerRequest, ScreenerResult } from "./screener-types";

const fieldValue = (metrics: Record<string, any>, field: string) => metrics[field];
function compare(actual: any, filter: ScreenerFilter, metrics: Record<string, any>) {
  if (actual == null) return false;
  const target = typeof filter.value === "string" && filter.value in metrics ? metrics[filter.value] : filter.value;
  switch (filter.operator) { case "=": return actual === target; case "!=": return actual !== target; case ">": return actual > target; case ">=": return actual >= target; case "<": return actual < target; case "<=": return actual <= target; }
}
export function evaluateScreenerFilters(metrics: Record<string, any>, request: ScreenerRequest) {
  const filters = request.filters ?? []; const conditions = filters.map((filter) => ({ field: filter.field, passed: compare(fieldValue(metrics, filter.field), filter, metrics), actual: fieldValue(metrics, filter.field), target: typeof filter.value === "string" && filter.value in metrics ? metrics[filter.value] : filter.value }));
  const matched = request.logic === "OR" ? conditions.some((x) => x.passed) : conditions.every((x) => x.passed);
  return { matched, conditions, failureReasons: conditions.filter((x) => !x.passed).map((x) => `${x.field} ${filters.find((f) => f.field === x.field)?.operator} ${x.target}`) };
}
export function rankScreenerResults(rows: ScreenerResult[], request: ScreenerRequest) {
  const ranking = request.ranking ?? []; return [...rows].sort((a, b) => { for (const rule of ranking) { const av = a.metrics[rule.field] as any, bv = b.metrics[rule.field] as any; if (av === bv) continue; return (av == null ? 1 : bv == null ? -1 : av > bv ? 1 : -1) * (rule.direction === "DESC" ? -1 : 1); } return a.name.localeCompare(b.name, "ko"); }).slice(0, Math.max(1, Math.min(1000, request.limit ?? 100)));
}
