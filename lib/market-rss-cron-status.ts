export function getMarketRssCronStatus(ingestFailureCount: number, translation: { fallback?: number; failed?: number; fallbackReasons?: Record<string, unknown> }) {
  const normalizeCount = (value: unknown, optional = false) => {
    if (value === undefined && optional) return { count: 0, invalid: false };
    if (typeof value !== "number" || !Number.isFinite(value)) return { count: 0, invalid: true };
    return { count: Math.max(0, Math.trunc(value)), invalid: false };
  };
  const ingest = normalizeCount(ingestFailureCount);
  const fallback = normalizeCount(translation.fallback, true);
  const failed = normalizeCount(translation.failed, true);
  const safeIngestFailures = ingest.count;
  const translationFailureCount = fallback.count + failed.count;
  let fallbackReasonCountInvalid = false;
  if (translation.fallbackReasons !== undefined) {
    const reasonCounts = Object.values(translation.fallbackReasons).map((value) => normalizeCount(value));
    fallbackReasonCountInvalid = reasonCounts.some((value) => value.invalid)
      || reasonCounts.reduce((sum, value) => sum + value.count, 0) !== translationFailureCount;
  }
  const partialFailureCount = safeIngestFailures + translationFailureCount;
  const counterDataInvalid = ingest.invalid || fallback.invalid || failed.invalid || fallbackReasonCountInvalid;
  return {
    degraded: partialFailureCount > 0 || counterDataInvalid,
    counterDataInvalid,
    partialFailureCount,
    ingestFailureCount: safeIngestFailures,
    translationFailureCount,
  };
}
