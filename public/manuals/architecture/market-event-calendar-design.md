# 미국 급등주 사전 이벤트 캘린더 구조

> **폐기됨 (2026-10-26)**: 캘린더 UI, API, cron 수집과 런타임 저장 모듈을 제거했다. 본 문서는 구현 이력 보존용이며 현행 API 계약이 아니다.

## 목적

FDA·실적·SEC·기업행사·희석·거래소 이벤트를 동일한 일정 계약으로 저장하고, 예정일 전에 확인한 뒤 실제 발표와 가격·거래량 반응을 Codex 분석에 연결한다.

## 흐름

```text
공식 출처 수집
→ 종목·이벤트 정규화
→ investment_calendar_events 멱등 저장
→ 예정 이벤트 조회
→ 발표/공시 원문 연결
→ 가격·거래량 반응 결합
→ Codex 호재·악재·희석 위험 분석
```

## 이벤트 분류

- FDA: `FDA_DECISION`, `FDA_ADCOM`, `CLINICAL_READOUT`
- 실적·가이던스: `EARNINGS`, `GUIDANCE`
- 공시·자금조달: `SEC_FILING`, `OFFERING`, `WARRANT`
- 기업 구조: `MERGER`, `REVERSE_SPLIT`, `SHAREHOLDER_MEETING`, `LOCKUP_EXPIRY`
- 거래소·시장: `EXCHANGE_COMPLIANCE`, `IPO`
- 배당: `EX_DIVIDEND`, `DIVIDEND_PAYMENT`

## 출처 원칙

- FDA 자문위원회 일정은 FDA 공식 Advisory Committee Calendar와 개별 회의 자료를 기준으로 한다. 개별 PDUFA 목표일은 FDA가 전체 미래 일정을 공개하지 않으므로 회사 IR·SEC 공시 또는 FDA 개별 심사 자료의 원문을 출처로 저장한다. 운영 기록과 상태 갱신 절차는 [`../operations/fda-approval-calendar.md`](../operations/fda-approval-calendar.md)를 따른다.
- SEC 이벤트는 EDGAR 제출 기록과 원문 공시를 기준으로 한다.
- 실적 발표일은 회사 IR 공지 또는 신뢰 가능한 거래소/공시 자료로 확인하고, 추정일은 `isEstimated`에 해당하는 별도 상태로 표시해야 한다.
- 일정 존재 자체를 호재로 판정하지 않는다. 발표 내용, 예상 대비 결과, 희석 구조, 유통주식수, 거래량 반응을 Codex가 함께 분석한다.

## 표준 표시 필드

`market`, `code`, `companyName`, `eventType`, `eventDate`, `eventEndDate`, `title`, `description`, `source`, `sourceUrl`, `fetchedAt`, `updatedAt`를 유지한다. 예정시각과 시간대가 있으면 설명에 섞지 말고 원본 payload에 보존한다.

## 운영 API

- `GET /api/investment-calendar`: 기간·시장·티커·이벤트 종류별 조회
- `POST /api/investment-calendar`: cron 전용 멱등 적재
- Codex 분석 시 일정 API 결과와 `market-intelligence`의 RSS·SEC·기초정보를 함께 조회한다.

## 보수적 판정

- 일정이 취소·연기되면 기존 행을 삭제하지 않고 최신 `updatedAt`과 원본 payload를 갱신한다.
- 공식 출처가 없는 예상일은 확정 일정으로 표시하지 않는다.
- FDA 자문위원회는 승인 결정과 구분한다.
- 워런트·증자·합병·역분할은 원문 근거가 없는 경우 `미확인`으로 남긴다.
- 활성 `COMMON_STOCK` 확인에 실패한 종목은 급등주 후보로 반환하지 않는다.
