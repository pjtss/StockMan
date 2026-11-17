# GlobeNewswire RSS 수집 복구

## 증상과 원인

운영 설정에서 `GLOBENEWSWIRE`는 활성화되어 있었지만, 기본 URL `https://rss.globenewswire.com/`은 RSS가 아닌 HTML 홈페이지를 반환했다. 공통 파서는 HTTP 200만 확인했기 때문에 HTML을 빈 피드로 취급했고, 수집 결과가 `STORED`/0건으로 기록되어 장애가 감춰졌다.

## 수정

- GlobeNewswire 공식 Public Companies RSS URL을 기본값으로 사용한다.
- `GLOBENEWSWIRE_RSS_URL` 명시적 재정의는 유지한다. 운영 환경에서 이 변수를 설정했다면 값이 홈페이지가 아닌 공식 RSS/Atom endpoint인지 확인한다.
- 공통 파서는 XML 문법과 RSS `<rss><channel>` 또는 Atom `<feed>` root를 검증한다. HTML 200, 잘못된 XML, 지원하지 않는 root, channel 없는 RSS는 수집 실패로 처리한다. 유효한 빈 RSS/Atom은 허용한다.

## 검증

- 프로젝트 `fetchMarketRss`로 공식 feed endpoint를 직접 요청: HTTP 200, `application/rss+xml`, 20개 항목 파싱.
- 회귀 테스트: HTML 응답·잘못된 XML 거부, 정상 RSS/Atom 파싱.
- RSS 관련 테스트 11개 통과, 타입 검사·프로덕션 빌드 통과, 로컬 앱 기동 및 HTTP 200 응답 확인.

## 배포 후 확인

1. 운영 `/api/admin/debug-suite?checks=rss` 결과에서 최신 `GLOBENEWSWIRE` snapshot URL이 공식 피드 주소인지 확인한다.
2. 최근 `market-rss` run의 해당 source 결과가 `FETCH_FAILED`가 아닌지, `count`가 0보다 큰지 확인한다.
3. `market_rss_articles`에서 `source='GLOBENEWSWIRE'` 행의 최신 `created_at` 및 `published_at`이 업데이트되는지 확인한다.
4. 운영 URL이 계속 홈페이지 루트라면 운영 `GLOBENEWSWIRE_RSS_URL` override를 점검한다.

## 재발 방지

RSS 성공 판정은 HTTP status만으로 하지 않는다. XML 문법과 feed root를 검증하고, source별 최근 수집 시각·상태·항목 수를 모니터링한다. HTML 응답이 200이어도 `FETCH_FAILED`여야 한다.
