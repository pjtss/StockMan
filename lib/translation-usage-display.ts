export type TranslationUsageDiagnostics = {
  cacheHits?: number;
  apiCalls?: number;
  apiFailures?: number;
  reservedCharacters?: number;
  translatedCharacters?: number;
  quotaFallbacks?: number;
  cacheWriteFailures?: number;
  usageRecordFailures?: number;
  cacheInvalidationFailures?: number;
  reservationReleaseFailures?: number;
};

export function getTranslationUsageDiagnosticLine(usage: TranslationUsageDiagnostics) {
  const warnings = [
    usage.cacheWriteFailures ? `번역 캐시 저장 실패 ${usage.cacheWriteFailures}건` : "",
    usage.usageRecordFailures ? `번역량 누적 실패 ${usage.usageRecordFailures}건` : "",
    usage.cacheInvalidationFailures ? `오류 캐시 삭제 실패 ${usage.cacheInvalidationFailures}건` : "",
    usage.reservationReleaseFailures ? `한도 예약 회수 실패 ${usage.reservationReleaseFailures}건` : "",
  ].filter(Boolean);
  return [
    `캐시 ${usage.cacheHits ?? 0}건`,
    `Google 호출 ${usage.apiCalls ?? 0}건(실패 ${usage.apiFailures ?? 0})`,
    `월간 한도 반영(예약 포함) ${Number(usage.reservedCharacters ?? 0).toLocaleString()}자`,
    `번역량 누적 ${Number(usage.translatedCharacters ?? 0).toLocaleString()}자`,
    `한도 fallback ${usage.quotaFallbacks ?? 0}건`,
    warnings.length ? `⚠️ ${warnings.join(" · ")}` : "",
  ].filter(Boolean).join(" · ");
}
