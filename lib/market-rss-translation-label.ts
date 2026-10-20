import { getMarketRssTranslationReasonDisplay } from "./market-rss-translation-reason";
import { getMarketRssTranslationRetryState } from "./market-rss-retry-display";

export type MarketRssTranslationDisplayInput = {
  translationStatus: string;
  translationFallback: boolean;
  title?: string | null;
  translatedTitle?: string | null;
  translationError?: string | null;
  translationSkippedReason?: string | null;
  translationAttempts?: number | null;
  translationAttemptedAt?: string | Date | null;
  notifyEligible: boolean;
  isBacklog: boolean;
  notificationStatus?: string;
};

export function areMarketRssTitlesEquivalent(left?: string | null, right?: string | null) {
  if (!left || !right) return false;
  return left.normalize("NFC").replace(/\s+/gu, " ").trim()
    === right.normalize("NFC").replace(/\s+/gu, " ").trim();
}

export function getMarketRssTranslationDisplay(input: MarketRssTranslationDisplayInput) {
  if (input.translationFallback) {
    const display = getMarketRssTranslationReasonDisplay(input.translationSkippedReason);
    const retryState = getMarketRssTranslationRetryState({
      ...input,
      translationAttempts: input.translationAttempts ?? undefined,
    });
    const retryDisplay = retryState.display;
    const showRetryDetails = retryDisplay !== null
      && (input.translationStatus === "FAILED"
        || input.translationSkippedReason === "cloud_translation_not_configured"
        || input.translationSkippedReason === "monthly_character_limit_reached"
        || input.translationSkippedReason === "provider_daily_quota_exceeded"
        || input.translationSkippedReason === "translation_output_incomplete"
        || input.translationSkippedReason === "target_language_not_detected"
        || input.translationSkippedReason === "translation_response_unparseable"
        || input.translationSkippedReason === "translation_cache_invalidation_failed");
    const retrySuffix = showRetryDetails ? ` · ${retryDisplay}` : "";
    const terminal = (retryDisplay?.startsWith("자동 재시도 종료") ?? false)
      || (input.translationStatus === "FAILED" && Number(input.translationAttempts) >= 3);
    return { label: `${display.label}${retrySuffix}`, tone: terminal ? "translationError" as const : display.tone };
  }
  if (input.translationSkippedReason === "already_in_target_language") return { label: "번역 불필요 · 이미 한국어", tone: "translationMuted" as const };
  if (!input.notifyEligible) return { label: "번역 대상 제외 · 알림 비대상", tone: "translationMuted" as const };
  if (input.isBacklog) return { label: "번역 대상 제외 · 과거 기사", tone: "translationMuted" as const };
  if (input.translationStatus === "TRANSLATED" && areMarketRssTitlesEquivalent(input.title, input.translatedTitle)) {
    return { label: "번역 결과가 원문과 동일 · 검토 필요", tone: "translationWarning" as const };
  }
  if (input.translationStatus === "TRANSLATED") return { label: "번역 완료", tone: "translationSuccess" as const };
  if (input.translationStatus === "FAILED") return { label: "번역 실패 · 재시도 확인 필요", tone: "translationError" as const };
  if (input.translationStatus === "SKIPPED") return { label: "번역 건너뜀", tone: "translationWarning" as const };
  return { label: "번역 대기", tone: "translationMuted" as const };
}
