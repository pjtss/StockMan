# 일봉 골든크로스 운영

국내·해외 보통주 일봉 캐시를 갱신한 뒤 9일 단순이동평균(SMA)이 20일 SMA를 상향 돌파한 종목을 탐지한다. 당일 포함 최신 저장 봉을 사용하며, 직전 봉에서 `SMA9 <= SMA20`, 최신 봉에서 `SMA9 > SMA20`인 경우만 적격으로 판정한다.

## API

- `GET /api/cron/kr-golden-cross?debug=true`
- `GET /api/cron/us-golden-cross?debug=true`

두 API 모두 `CRON_SECRET` 인증이 필요하다. `debug=true`는 일정·간격 조건을 건너뛰고 실제 DB 캐시를 갱신한다.

## 결과 캐시

탐지 결과는 기존 `kis_cache`에 별도 키로 저장한다.

- 국내: `daily-golden-cross:KR:D`
- 해외: `daily-golden-cross:US:D`

일봉 캐시 갱신 API가 먼저 실행되고 같은 cron 패스에서 골든크로스 API가 뒤따른다. 따라서 탐지 결과는 최신 일봉 캐시를 기반으로 다시 계산된다. `qualified`에는 적격 종목, `scannedCount`에는 계산 대상 수, `updatedAt`에는 저장 시각을 기록한다.

볼린저밴드도 동일한 방식으로 탐지 결과를 별도 저장한다.

- `daily-bollinger:KR:D:LOWER_OR_BELOW`
- `daily-bollinger:KR:D:MIDDLE_TO_LOWER`
- `daily-bollinger:US:D:LOWER_OR_BELOW`
- `daily-bollinger:US:D:MIDDLE_TO_LOWER`

OCI cron은 각 시장별로 `일봉 캐시 → 볼린저밴드 결과 캐시 → 골든크로스 결과 캐시` 순서로 호출한다. 캐시 확인용 일회성 API는 `GET /api/debug/daily-golden-cross-cache`이며 `CRON_SECRET` 인증이 필요하다.
