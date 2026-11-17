type FailedScanRow = { error?: unknown };

export function isUsDailyScanComplete(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const result = value as Record<string, unknown>;
  const instrumentCount = result.instrumentCount;
  if (result.ok === false || result.status === "FAILED" || result.universeAvailable === false) return false;
  if (typeof instrumentCount !== "number" || !Number.isSafeInteger(instrumentCount) || instrumentCount <= 0) return false;
  if (typeof result.failureCount === "number" && result.failureCount > 0) return false;
  if (typeof result.partialFailureCount === "number" && result.partialFailureCount > 0) return false;
  if (typeof result.successCount === "number" && result.successCount !== instrumentCount) return false;
  return true;
}

function failureCategory(error: unknown) {
  if (typeof error !== "string" || !error.trim()) return "ROW_PROCESSING_ERROR";
  const normalized = error.trim().toLowerCase();
  if (normalized === "no cached daily candles") return "NO_CACHED_DAILY_CANDLES";
  if (normalized.startsWith("insufficient daily candles")
    || normalized.startsWith("fewer than ")
    || normalized.startsWith("insufficient parsed candles")) return "INSUFFICIENT_CANDLE_HISTORY";
  return "ROW_PROCESSING_ERROR";
}

export function summarizeUsDailyScanFailures<T extends FailedScanRow>(rows: T[]) {
  return rows.reduce<Record<string, number>>((counts, row) => {
    const category = failureCategory(row.error);
    counts[category] = (counts[category] ?? 0) + 1;
    return counts;
  }, {});
}
