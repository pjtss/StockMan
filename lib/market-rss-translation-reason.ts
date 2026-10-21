export const MARKET_RSS_TRANSLATION_FALLBACK_REASONS = {
  cloud_translation_not_configured: { label: "원문 fallback · 번역 설정 누락", shortLabel: "provider 미설정", tone: "translationWarning", operatorAction: "운영 환경에서 Azure F0 provider 구성 또는 GOOGLE_TRANSLATION_API_KEY 설정과 API 사용 권한을 확인하세요. 설정 복구 후 자동 재시도됩니다." },
  monthly_character_limit_reached: { label: "원문 fallback · 월간 한도 도달", shortLabel: "월간 한도", tone: "translationWarning", operatorAction: "앱 월간 번역 예산이 UTC 월말까지 소진됐습니다. 다음 UTC 월이 시작된 뒤 자동 재시도됩니다." },
  hourly_character_limit_reached: { label: "원문 fallback · 최근 60분 한도 도달", shortLabel: "시간당 한도", tone: "translationWarning", operatorAction: "최근 60분 provider 번역 예산을 소진했습니다. 예약 시점에서 60분이 지난 뒤 자동 재시도됩니다." },
  provider_daily_quota_exceeded: { label: "원문 fallback · Google 일일 번역 한도 도달", shortLabel: "Google 일일 한도", tone: "translationWarning", operatorAction: "Google 일일 한도는 태평양 시간 자정에 초기화됩니다. 초기화 후 자동 재시도됩니다." },
  provider_free_quota_exceeded: { label: "원문 fallback · Azure F0 무료량 초과", shortLabel: "Azure F0 무료량", tone: "translationWarning", operatorAction: "Azure F0의 공급자 무료량을 소진했습니다. 전용 F0 리소스와 외부 사용량을 확인하고 다음 UTC 월에 다시 시도됩니다." },
  protected_token_mismatch: { label: "원문 fallback · 숫자/티커 보존 검증 실패", shortLabel: "숫자/티커 검증", tone: "translationError", operatorAction: "원문 금액·비율·티커가 보존되지 않아 번역을 사용하지 않았습니다. 원문을 기준으로 의미를 확인하세요." },
  translation_numeric_hallucination: { label: "원문 fallback · 번역 제목에 없는 숫자/부호 발견 · 재검수 대기", shortLabel: "숫자·부호 추가 의심", tone: "translationError", operatorAction: "후보 번역의 숫자·통화 단위·상승/하락 부호를 원문 및 요약과 대조하세요. 확인 전 후보를 알림에 사용하지 않습니다." },
  target_language_not_detected: { label: "원문 fallback · 한국어 번역 결과 확인 실패", shortLabel: "한국어 결과 확인", tone: "translationError", operatorAction: "한국어가 충분히 확인되지 않은 결과입니다. 원문과 후보를 대조하고, 자동 재시도 횟수가 끝나면 provider 상태를 점검하세요." },
  translation_output_incomplete: { label: "원문 fallback · 제목 일부만 번역된 것으로 보여 재시도 대기", shortLabel: "부분 번역 의심", tone: "translationError", operatorAction: "부분 번역 의심 후보입니다. 원문 요약·링크와 대조해 빠진 핵심 내용을 확인하세요." },
  translation_response_unparseable: { label: "원문 fallback · 번역 응답 형식 확인 실패", shortLabel: "응답 형식 확인", tone: "translationError", operatorAction: "번역 응답에서 사용할 제목을 추출하지 못했습니다. 재시도 후 반복되면 provider 응답 구조와 API 상태를 확인하세요." },
  translation_cache_invalidation_failed: { label: "원문 fallback · 불량 번역 캐시 삭제 실패 · 재시도 대기", shortLabel: "불량 캐시 삭제 실패", tone: "translationError", operatorAction: "검증 실패 캐시를 삭제하지 못했습니다. 캐시 DB 연결·쓰기 권한을 복구하고, 표시된 후보는 신뢰하지 마세요." },
  translation_input_empty: { label: "원문 fallback · RSS 제목 내용 없음 · 재수집 후 재시도", shortLabel: "RSS 제목 없음", tone: "translationError", operatorAction: "RSS 공급자가 빈 제목을 보냈습니다. provider 원문을 확인하고 다음 수집에서 제목이 보충되는지 확인하세요." },
  translation_preparation_error: { label: "원문 fallback · 번역 cache/quota 준비 오류", shortLabel: "번역 준비 오류", tone: "translationError", operatorAction: "번역 호출 전 cache 또는 quota 준비 단계가 실패했습니다. DB 연결과 quota 저장소 상태를 확인하세요." },
  translation_api_error: { label: "원문 fallback · 공급자 오류", shortLabel: "API 오류", tone: "translationError", operatorAction: "번역 요청이 실패했습니다. 상세 오류의 HTTP 상태를 보고 Azure/Google 키·API 권한·quota·네트워크를 구분해 확인하세요." },
  unknown: { label: "원문 fallback · 번역 결과 없음", shortLabel: "기타", tone: "translationWarning", operatorAction: "분류되지 않은 번역 상태입니다. 전체 처리 결과 JSON과 자동화 실행 로그를 확인하세요." },
} as const;

export type MarketRssTranslationFallbackReason = keyof typeof MARKET_RSS_TRANSLATION_FALLBACK_REASONS;

export function getMarketRssTranslationReasonDisplay(reason: string | null | undefined) {
  if (reason && Object.hasOwn(MARKET_RSS_TRANSLATION_FALLBACK_REASONS, reason)) {
    return MARKET_RSS_TRANSLATION_FALLBACK_REASONS[reason as MarketRssTranslationFallbackReason];
  }
  return MARKET_RSS_TRANSLATION_FALLBACK_REASONS.unknown;
}
