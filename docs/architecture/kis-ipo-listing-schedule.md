# KIS 국내 신규 상장 일정 어댑터

## 현재 모듈

`lib/kis-ipo-listing-schedule.ts`는 KIS 국내주식 상장정보 endpoint `/uapi/domestic-stock/v1/ksdinfo/list-info`의 요청 어댑터다. `F_DT`·`T_DT` 날짜 범위, 선택적 `SHT_CD` 종목코드, 페이지 연속값 `CTS`를 전달한다. 거래 ID는 `HHKDB669107C0`이다.

어댑터는 `lib/kis-request-framework.ts`의 `kisRequest`를 사용해 공통 요청 제한·재시도·관측 경계를 따른다. 응답 원본 구조를 별도 재해석하거나 DB에 저장하지 않으며, 호출자가 `KisResponse`를 처리한다.

## 회귀 방지

- `scripts/kis-module-registry.mjs`에 모듈 목적, 공식 endpoint 경로, 대표 함수를 등록한다.
- `scripts/audit-kis-boundary.mjs`에 대표 테스트를 연결한다. 미등록 KIS 파일 또는 endpoint/function 불일치 시 `npm run audit:kis-boundary`가 실패한다.
- `lib/kis-ipo-listing-schedule.test.ts`는 URL 파라미터, optional 값 정규화, 공통 요청 경계 전달 및 응답 전달을 검증한다. HTTP 오류·rate limit 재시도는 공유 `kisRequest` 테스트에서 검증한다.

## 범위

이 문서는 KIS adapter 등록을 설명한다. 사용자-facing 신규 상장 일정 API의 데이터 출처나 동기화 동작을 변경하지 않는다.
