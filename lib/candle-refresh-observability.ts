export type CandleRefreshTimeframe = "D" | "W" | "M";
export type CandleRefreshMetric = { market: string; timeframe: CandleRefreshTimeframe; instrumentCount: number; successCount: number; failureCount: number; savedCandleCount: number; durationMs: number; startedAt: string; finishedAt: string; status: "COMPLETED" | "FAILED" };

export function measureCandleRefresh<T>(input: { market: string; timeframe: CandleRefreshTimeframe; instrumentCount: number }, operation: () => Promise<{ ok: boolean; savedCandleCount?: number }>): Promise<{ value: T | null; metric: CandleRefreshMetric }> {
  const started = Date.now(); const startedAt = new Date(started).toISOString();
  return operation().then((value) => ({ value: value as T, metric: { market: input.market, timeframe: input.timeframe, instrumentCount: input.instrumentCount, successCount: value.ok ? 1 : 0, failureCount: value.ok ? 0 : 1, savedCandleCount: value.savedCandleCount ?? 0, durationMs: Date.now() - started, startedAt, finishedAt: new Date().toISOString(), status: (value.ok ? "COMPLETED" : "FAILED") as "COMPLETED" | "FAILED" } })).catch(() => ({ value: null, metric: { market: input.market, timeframe: input.timeframe, instrumentCount: input.instrumentCount, successCount: 0, failureCount: 1, savedCandleCount: 0, durationMs: Date.now() - started, startedAt, finishedAt: new Date().toISOString(), status: "FAILED" as const } }));
}
