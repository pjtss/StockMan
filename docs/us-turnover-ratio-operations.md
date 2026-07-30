# 시총 대비 거래대금 운영 설계

## 책임 분리

시총 대비 거래대금 자동화는 다음 책임을 분리한다.

1. KIS 후보·상세 시세 수집
2. 데이터 품질 판정
3. 성공 종목 스냅샷 저장
4. 신규·기존·복귀 상태와 거래대금 추세 계산
5. 알림 후보 및 cooldown 판정
6. Discord 전송과 전송 실패 재처리

스냅샷 상태는 `NEW`, `CONTINUING`, `RECOVERED`, `INSUFFICIENT`, `STALE`로 별도 계산하며, `INSUFFICIENT`는 신규 알림으로 간주하지 않는다.

Discord Webhook이 없거나 전송에 실패해도 1~5번은 실행되어야 한다. 따라서 Webhook 설정 확인은 수집·저장 전에 수행하지 않고, 알림 후보가 확정된 뒤 전송 경계에서만 수행한다.

## 실행 흐름

```text
스케줄·기능 플래그 확인
→ KIS 거래소별 후보 수집
→ 상세 시세 조회
→ 성공 종목 전체 스냅샷 저장
→ 상태·1/3/5분 추세 계산
→ 알림 후보 판정
→ Webhook 확인
→ Discord 전송
```

## 운영 확인 항목

- `sourceCount`: KIS 후보 수
- `priceDetailAttemptCount`: 상세 조회 시도 수
- `priceDetailSuccessCount`: 상세 조회 성공 수
- 스냅샷 저장 수와 실패 수
- 필터별 탈락 사유
- 신규·기존·복귀·비교 데이터 부족 상태
- Discord 전송 성공·실패 및 재시도 상태
- 실행별 스냅샷 상태 집계(`NEW`, `CONTINUING`, `RECOVERED`, `INSUFFICIENT`, `STALE`)

## 문서·코드 관리 원칙

- KIS 호출은 API client 모듈만 담당한다.
- 저장소는 DB 입출력만 담당한다.
- 추세·필터 계산은 순수 함수로 유지한다.
- Discord 모듈은 payload 변환과 전송만 담당한다.
- 운영 정책 변경은 이 문서와 테스트를 함께 갱신한다.
