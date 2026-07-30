# 시총 대비 거래대금 필터 실시간 계약

현재 DB에 저장된 관리자 필터와 자동화 적용 조건은 인증된 디버그 API에서 확인한다.

```bash
curl -sS -H "x-cron-secret: $CRON_SECRET" \
  http://127.0.0.1:3000/api/debug/us-turnover-filters
```

운영 배포 도메인에서 조회할 때는 다음과 같이 호출한다.

```bash
curl -sS -H "x-cron-secret: $CRON_SECRET" \
  https://stockman.r-e.kr/api/debug/us-turnover-filters
```

운영 도메인: `https://stockman.r-e.kr`

응답의 `settings`가 DB 설정(누락된 값은 기본값 병합)이며, `candidateUniverse`는 세 거래소 TOP 100을 상세 시세 조회 성공 후 스냅샷에 저장한다는 계약이다. `alertLogic.increase`의 모든 조건은 상승 알림에 적용된다.
