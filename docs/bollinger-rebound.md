# 볼린저밴드 하단 이탈 후 재터치 탐지

## 적용 범위

- 국내·해외 `하단 이하` 볼린저밴드 모듈에 적용한다.
- `중단선~하단선` 모듈은 기존 구간 조건을 유지한다.
- OBV·ADL Signal 상회 조건은 기존 설정대로 AND 적용한다.

## 판정 규칙

1. 최근 봉을 제외한 설정 기간(`reboundLookback`, 기본 3봉) 안에 종가가 하단선보다 낮은 봉이 있어야 한다.
2. 최신 종가는 하단선 이상이어야 하며, 하단선과의 거리가 허용 오차(`reboundTolerancePercent`, 기본 0.5%) 이내여야 한다.
3. 두 조건과 가격·거래량·OBV·ADL 필터를 모두 통과하면 `QUALIFIED_RETOUCH`로 저장·알림한다.
4. 최신 종가가 아직 하단선 아래면 `BREAKOUT_BELOW`, 과거 이탈 또는 재터치가 없으면 `NO_REBOUND`로 기록한다.

## 관리자 설정

- `reboundAfterBreakout`: 재터치 정책 ON/OFF. OFF이면 기존 TOUCH/BELOW 판정으로 동작한다.
- `reboundLookback`: 과거 이탈을 확인할 봉 수(1~30).
- `reboundTolerancePercent`: 현재 종가와 하단선 사이 허용 거리(0~10%).

국내·해외 정책은 각각 `krBollingerPolicy`, `bollingerPolicy`에 저장되며, 진단 응답의 `dataPolicy.reboundPolicy`에도 반영된다.
