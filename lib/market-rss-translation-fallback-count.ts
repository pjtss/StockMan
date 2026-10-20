export function countMarketRssTranslationFallbackReasons(reasons: readonly (string | null | undefined)[]) {
  const counts: Record<string, number> = {};
  for (const rawReason of reasons) {
    const reason = rawReason || "unknown";
    counts[reason] = (counts[reason] || 0) + 1;
  }
  return counts;
}
