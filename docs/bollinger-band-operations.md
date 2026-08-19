# 국내·해외 볼린저밴드 탐지

## 지원 범위

국내·해외 유니버스를 대상으로 `D`(일봉), `W`(주봉), `M`(월봉)을 선택할 수 있다. 탐지는 KIS 원본을 직접 재조회하지 않고 각 시장의 DB 저장 캔들만 사용한다.

## 탐지 모듈

| 시장 | 하단 터치·이탈 | 중단선~하단선 | 관리자 경로 |
|---|---|---|---|
| 해외 | `us-bollinger-band` | `us-bollinger-middle-lower` | `/admin/modules/{key}` |
| 국내 | `kr-bollinger-band` | `kr-bollinger-middle-lower` | `/admin/modules/{key}` |

### 하단 터치·이탈

최근 저장 봉의 종가가 하단선과 같으면 `QUALIFIED_TOUCH`, 하단선보다 낮으면 `QUALIFIED_BELOW`로 분류한다.

### 중단선~하단선

최근 저장 봉의 종가가 `하단선 ≤ 종가 ≤ 중단선`이면 `QUALIFIED_MIDDLE_TO_LOWER`로 분류한다. 하단선 미만은 이 모듈에서 제외하며 하단 터치·이탈 모듈의 대상이다.

## 운영·디버깅

- 해외 자동화: `/api/cron/us-bollinger-band`, `/api/cron/us-bollinger-middle-lower`
- 국내 자동화: `/api/cron/kr-bollinger-band`, `/api/cron/kr-bollinger-middle-lower`
- 관리자 테스트: 각 모듈의 `/api/admin/*-test` 경로
- 실행 간격·요일·활성 시간·쿨다운·기간·표준편차 배수·가격·거래량·거래대금 필터는 관리자 모듈 설정에서 관리한다.
- 실행 결과는 `automation_runs`에 기록되며, 상품 제외와 DB 캔들 부족 사유를 결과에 포함한다.
