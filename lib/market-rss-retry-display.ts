import { MARKET_RSS_TRANSLATION_MAX_ATTEMPTS, MARKET_RSS_TRANSLATION_RETRY_DELAYS_MS, MARKET_RSS_TRANSLATION_RETRYABLE_SKIPPED_REASONS } from "./market-rss-translation-retry-constants";
import { getNextPacificQuotaDayStart, getPacificQuotaDayStart } from "./translation-quota-window";

export function formatMarketRssTranslationAttemptTime(value: string | Date | null | undefined) {
  if (!value) return null;
  const attemptedAt = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(attemptedAt.getTime())) return null;
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(attemptedAt);
}

export function getMarketRssTranslationAttemptLabel(article: {
  translationStatus: string;
  translationProvider?: string | null;
  translationFallback?: boolean;
  translationSkippedReason?: string | null;
}) {
  if (article.translationSkippedReason === "monthly_character_limit_reached") return "한도 확인";
  if (article.translationSkippedReason === "provider_daily_quota_exceeded") return "Google 일일 한도 확인";
  if (article.translationSkippedReason === "provider_free_quota_exceeded") return "Azure F0 무료량 확인";
  if (article.translationProvider === "azure-translator") return "Azure Translator API 요청";
  if (article.translationProvider === "google-cloud-translation") return "Google 번역 API 요청";
  if (article.translationSkippedReason === "already_in_target_language") return "번역 불필요 판정";
  if (article.translationSkippedReason === "cloud_translation_not_configured") return "번역 설정 확인";
  if (article.translationSkippedReason === "translation_input_empty") return "RSS 제목 입력 확인";
  if (article.translationSkippedReason === "translation_preparation_error") return "번역 준비 오류 처리";
  if (article.translationStatus === "TRANSLATED") return "캐시 번역 반영";
  if (article.translationFallback) return "번역 fallback 판정";
  if (article.translationStatus === "FAILED") return "번역 오류 처리";
  return "번역 상태 처리";
}

export type MarketRssTranslationRetryState = { display: string | null; retryReady: boolean };

export function getMarketRssTranslationRetryState(
  article: { translationStatus: string; translationSkippedReason?: string | null; translationAttempts?: number; translationAttemptedAt?: string | Date | null },
  now = new Date(),
): MarketRssTranslationRetryState {
  const state = (display: string | null, retryReady = false): MarketRssTranslationRetryState => ({ display, retryReady });
  if (article.translationStatus === "SKIPPED" && article.translationSkippedReason === "cloud_translation_not_configured") {
    const attempts = article.translationAttempts == null ? 0 : Number(article.translationAttempts);
    if (!Number.isInteger(attempts) || attempts < 0) return state("재시도 횟수 데이터 확인 필요");
    if (attempts >= MARKET_RSS_TRANSLATION_MAX_ATTEMPTS) return state(`자동 재시도 종료 (${attempts}/${MARKET_RSS_TRANSLATION_MAX_ATTEMPTS})`);
    return state("번역 설정 복구 후 자동 재시도", true);
  }

  if (article.translationStatus === "SKIPPED" && article.translationSkippedReason === "monthly_character_limit_reached") {
    const attemptedAt = article.translationAttemptedAt ? new Date(article.translationAttemptedAt) : null;
    if (!attemptedAt || Number.isNaN(attemptedAt.getTime())) return state("월간 한도 · 번역 시도 시각 확인 필요");
    if (attemptedAt > now) return state("월간 한도 · 미래 시각 데이터 확인 필요");

    const monthStartUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
    if (attemptedAt.getTime() < monthStartUtc) return state("월간 한도 해제 · 번역 재시도 가능", true);
    const nextMonthStartUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    if (attemptedAt.getTime() >= nextMonthStartUtc.getTime()) return state("월간 한도 · 미래 시각 데이터 확인 필요");
    const retryAtKst = new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(nextMonthStartUtc);
    return state(`월간 한도 대기 · ${retryAtKst} KST부터 재시도 가능`);
  }

  if (article.translationStatus === "SKIPPED" && article.translationSkippedReason === "provider_daily_quota_exceeded") {
    const attemptedAt = article.translationAttemptedAt ? new Date(article.translationAttemptedAt) : null;
    if (!attemptedAt || Number.isNaN(attemptedAt.getTime())) return state("Google 일일 한도 · 번역 시도 시각 확인 필요");
    if (attemptedAt > now) return state("Google 일일 한도 · 미래 시각 데이터 확인 필요");
    if (attemptedAt < getPacificQuotaDayStart(now)) return state("Google 일일 한도 해제 · 번역 재시도 가능", true);
    const retryAtKst = new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(getNextPacificQuotaDayStart(now));
    return state(`Google 일일 한도 대기 · ${retryAtKst} KST부터 재시도 가능`);
  }

  const retryableFallback = article.translationStatus === "SKIPPED"
    && MARKET_RSS_TRANSLATION_RETRYABLE_SKIPPED_REASONS.includes(article.translationSkippedReason as typeof MARKET_RSS_TRANSLATION_RETRYABLE_SKIPPED_REASONS[number]);
  if (article.translationStatus !== "FAILED" && !retryableFallback) return state(null);
  const attempts = article.translationAttempts == null ? 0 : Number(article.translationAttempts);
  if (!Number.isInteger(attempts) || attempts < 0) return state("재시도 횟수 데이터 확인 필요");
  if (attempts >= MARKET_RSS_TRANSLATION_MAX_ATTEMPTS) return state(`자동 재시도 종료 (${attempts}/${MARKET_RSS_TRANSLATION_MAX_ATTEMPTS})`);
  if (attempts < 1) return state("재시도 횟수 데이터 확인 필요");
  if (!article.translationAttemptedAt) return state(`재시도 시각 데이터 확인 필요 (${attempts}/${MARKET_RSS_TRANSLATION_MAX_ATTEMPTS})`);

  const attemptedAt = new Date(article.translationAttemptedAt);
  if (Number.isNaN(attemptedAt.getTime())) return state(`재시도 시각 데이터 확인 필요 (${attempts}/${MARKET_RSS_TRANSLATION_MAX_ATTEMPTS})`);
  if (attemptedAt > now) return state("번역 시도 시각이 미래 · 데이터 확인 필요");
  const retryAt = new Date(attemptedAt.getTime() + MARKET_RSS_TRANSLATION_RETRY_DELAYS_MS[attempts - 1]);
  if (now >= retryAt) return state(`재시도 가능 (${attempts}/${MARKET_RSS_TRANSLATION_MAX_ATTEMPTS})`, true);

  const remainingMinutes = Math.max(1, Math.ceil((retryAt.getTime() - now.getTime()) / 60_000));
  const retryAtKst = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(retryAt);
  return state(`재시도 대기 · ${remainingMinutes}분 후 (${retryAtKst} KST, ${attempts}/${MARKET_RSS_TRANSLATION_MAX_ATTEMPTS})`);
}

export function getMarketRssTranslationRetryDisplay(
  article: Parameters<typeof getMarketRssTranslationRetryState>[0],
  now = new Date(),
) {
  return getMarketRssTranslationRetryState(article, now).display;
}
