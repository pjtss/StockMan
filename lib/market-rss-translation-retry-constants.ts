/** Shared by the SQL retry selector and the administrator countdown UI. */
export const MARKET_RSS_TRANSLATION_RETRY_DELAYS_MS = [60_000, 5 * 60_000] as const;
export const MARKET_RSS_TRANSLATION_MAX_ATTEMPTS = MARKET_RSS_TRANSLATION_RETRY_DELAYS_MS.length + 1;
export const MARKET_RSS_TRANSLATION_RETRYABLE_SKIPPED_REASONS = [
  "protected_token_mismatch",
  "translation_numeric_hallucination",
  "target_language_not_detected",
  "translation_output_incomplete",
  "translation_response_unparseable",
  "translation_cache_invalidation_failed",
  "translation_input_empty",
] as const;
