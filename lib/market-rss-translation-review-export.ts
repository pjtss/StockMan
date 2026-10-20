import { isMarketRssTranslationReviewEligible } from "./market-rss-translation-review-eligibility";

export type TranslationReviewArticle = {
  externalId?: string | null;
  title: string;
  summary?: string | null;
  translatedTitle?: string | null;
  translationCandidateTitle?: string | null;
  translationStatus: string;
  translationFallback: boolean;
  translationSkippedReason?: string | null;
  detectedTicker?: string | null;
  source?: string;
  publishedAt?: string | null;
  link?: string;
};

const REVIEW_HEADERS = ["검수 판정(정확/자동검사 오탐 확인/부분번역/오역/보류)", "원문 제목", "원문 요약 (참고)", "번역 제목", "티커", "출처", "외부 기사 ID", "발행 시각", "기사 URL", "수정 번역", "검수 메모"];

export function getMarketRssTranslationReviewArticles<T extends TranslationReviewArticle>(articles: T[]) {
  return articles.filter(isMarketRssTranslationReviewEligible);
}

function protectSpreadsheetFormula(value: string) {
  return /^[\u0000-\u0020]*[=+\-@]/.test(value) ? `'${value}` : value;
}

function csvCell(value: unknown) {
  const safe = protectSpreadsheetFormula(value == null ? "" : String(value));
  return `"${safe.replace(/"/g, '""')}"`;
}

function getReviewContextNote(article: TranslationReviewArticle) {
  const hasSummary = typeof article.summary === "string" && article.summary.trim().length > 0;
  const hasLink = typeof article.link === "string" && article.link.trim().length > 0;
  if (hasSummary && hasLink) return "원문 요약과 기사 URL을 대조해 번역 의미·수치·방향 확인";
  if (!hasSummary && !hasLink) return "원문 요약·링크 없음 · 맥락 확인 후 판정";
  if (!hasSummary) return "원문 요약 없음 · 원문 링크에서 맥락 확인";
  if (!hasLink) return "원문 링크 없음 · 제공된 문맥만으로 검수";
  return "";
}

export function buildMarketRssTranslationReviewCsv(articles: TranslationReviewArticle[]) {
  const reviewArticles = getMarketRssTranslationReviewArticles(articles);
  const rows = reviewArticles.map((article) => [
    "",
    article.title,
    article.summary,
    article.translationCandidateTitle || article.translatedTitle,
    encodeMarketRssReviewCell("ticker", article.detectedTicker),
    article.source,
    encodeMarketRssReviewCell("externalId", article.externalId),
    encodeMarketRssReviewCell("publishedAt", article.publishedAt),
    article.link,
    "",
    [
      article.translationSkippedReason === "translation_output_incomplete" ? "RSS-REVIEW-CANDIDATE:incomplete · 자동 검사에서 부분 번역 의심으로 fallback · 후보 번역 검수" : "",
      article.translationSkippedReason === "target_language_not_detected" ? "RSS-REVIEW-CANDIDATE:target-language · 한국어 비율 검사 실패로 fallback · provider 후보 번역 검수" : "",
      article.translationSkippedReason === "translation_numeric_hallucination" ? "RSS-REVIEW-CANDIDATE:numeric-hallucination · 원문에 없는 숫자/부호가 번역 제목에서 감지됨 · 후보 번역 검수" : "",
      article.translationSkippedReason === "translation_cache_invalidation_failed" ? "RSS-REVIEW-CANDIDATE:cache-invalidation · 검증 실패 번역 캐시 삭제 실패 · 후보를 신뢰하지 말고 원문과 대조" : "",
      getReviewContextNote(article),
    ].filter(Boolean).join(" · "),
  ]);
  return { count: reviewArticles.length, content: `\uFEFF${[REVIEW_HEADERS, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}` };
}
import { encodeMarketRssReviewCell } from "./market-rss-translation-review-cell-codec.mjs";
