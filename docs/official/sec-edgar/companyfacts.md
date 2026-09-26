# SEC Company Facts 저장 명세

공식 기준: [SEC EDGAR APIs](https://www.sec.gov/search-filings/edgar-application-programming-interfaces)

## 운영 조회와 일일 갱신

- `/api/admin/sec-company-facts`는 관리자 세션만 허용한다. POST에서 티커 또는 CIK를 받아 SEC 공식 Company Facts를 수집·저장한다. GET은 저장된 전체 JSON을 읽으며 SEC를 다시 호출하지 않는다.
- 수동·예약 경로 모두 SEC 티커 매핑 후 `us_common_stock_universe`의 활성 `COMMON_STOCK` 상태와 ETF·워런트·파생·DR·레버리지·인버스 제외 플래그를 확인한다. 조회 실패, 티커 매핑 불가, 비활성/비보통주는 fail-closed로 거부한다.
- `기타` 페이지에서 단일 종목을 조회하고 저장 JSON을 펼쳐 복사하거나 다운로드할 수 있다. 대용량 JSON은 사용자가 열기를 선택했을 때만 브라우저로 가져온다.
- OCI cron은 `/api/cron/sec-company-facts`를 5분 주기로 호출한다. 전용 기능 모듈의 기본 KST 시간창은 매일 08:00–08:10이며, DB advisory lock과 KST 날짜별 성공 이력으로 중복 실행을 방지한다. 실패 실행은 시간창 안에서 재시도할 수 있다.
- 일일 후보 CIK는 `/admin/modules/sec-company-facts` 설정 또는 `SEC_SYNC_CIKS`에서 가져오되, 저장 전에 공식 해외 보통주 마스터로 필터링한다. 비보통주 CIK는 Company Facts endpoint를 호출하지 않는다.
- `sec-realtime`의 Submissions/Discord 스케줄 및 CIK 설정은 변경하지 않는다.

## 원본 필드 보존

Company Facts API 응답은 선택·정규화 전에 응답 전체를 보존한다. 운영 모듈 경계는 다음과 같다.

- 수집: `lib/sec-company-facts-collector.ts`가 `lib/sec-edgar-client.ts`를 통해 공식 Company Facts endpoint를 호출하고, 전체 parsed JSON과 원문 응답 문자열, URL, HTTP status, headers, fetched timestamp를 반환한다.
- 저장: `lib/sec-company-facts-persistence.ts`가 parsed 전체 payload를 `sec_xbrl_snapshots.payload`에 upsert하고, 정확한 응답 body 및 response metadata를 `sec_source_snapshots`에 content hash 기준으로 보존한다.
- 연결 실행: `lib/sec-company-facts-sync.ts`가 수집 성공 시에만 저장 모듈을 실행한다. 실패 응답이면 DB 쓰기를 호출하지 않는다. 기존 cron/admin 호출은 `lib/sec-edgar-repository.ts`의 호환 export를 통해 이 application service를 사용한다.
- 검증: `lib/sec-company-facts.test.ts`는 전체/확장 taxonomy와 중첩 필드 보존, 원문 body 전달, CIK 정규화, fetch 실패 시 저장 미호출을 검사한다.

DB 구조는 `sec_xbrl_snapshots`의 최신 parsed snapshot과 `sec_source_snapshots`의 전체 원문 이력으로 이중 보존한다. 후자는 `(source_type, source_key, content_hash)`가 동일한 응답은 중복 적재하지 않으므로 변경된 API 응답만 추가 이력으로 쌓인다.

- `entityName`
- `cik`
- taxonomy
- concept
- unit
- `val`
- `accn`
- `fy`
- `fp`
- `form`
- `filed`
- `frame`
- `start`
- `end`

## 정규화 원칙

- `instant` 데이터와 `duration` 데이터를 구분한다.
- `start`·`end`가 없는 instant 데이터는 `period_end`만 사용한다.
- `frame`은 보조적인 비교 기준으로 저장하고, 실제 기간은 start/end를 우선한다.
- 회사별 custom taxonomy는 표준 비교 데이터와 별도로 보존한다.
- 동일 concept라도 단위가 다르면 별도 행으로 저장한다.

## 중복키

```text
market, code, taxonomy, concept, unit,
period_start, period_end, form, accn, filed
```
