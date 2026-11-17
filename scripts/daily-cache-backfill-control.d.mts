export function parseBoundedIntegerSetting(
  name: string,
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number;

export function mergeBackfillPage<T extends { date: string }>(
  candlesByDate: Map<string, T>,
  pageCandles: readonly T[],
): number;

export function getBackfillRunError(totalCount: number, failedCount: number): string | null;
