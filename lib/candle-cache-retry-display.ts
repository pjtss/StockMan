export function summarizeRetryQueueFailures(value: unknown) {
  if (!value || typeof value !== "object") return [] as string[];
  const result = value as Record<string, unknown>;
  const failures: string[] = [];
  if (Array.isArray(result.results)) {
    for (const item of result.results) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      if (!Array.isArray(row.retryQueueFailures)) continue;
      const timeframes = row.retryQueueFailures.filter((entry): entry is string => typeof entry === "string");
      if (timeframes.length) failures.push(`${String(row.market ?? "?")}:${String(row.code ?? "?")} (${timeframes.join(",")})`);
    }
  }
  if (Array.isArray(result.failures)) {
    for (const item of result.failures) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      if (row.retryQueued === false) failures.push(`${String(row.market ?? "?")}:${String(row.code ?? "?")} (${String(row.error ?? "retry queue unavailable")})`);
    }
  }
  return failures;
}
