# KIS Open API 요청 프레임워크

모든 KIS 데이터 API 호출은 `lib/kis-request-framework.ts`의 `kisRequest`를 통과한다.

## 표준 동작

- `buildKisAuthorization`으로 DB 액세스 토큰을 `Bearer` 헤더에 구성한다.
- `KIS_APPKEY`, `KIS_APPSECRET`, `tr_id`, `custtype` 헤더를 공통 생성한다.
- `lib/kis-request-throttle.ts`를 통해 전역 TPS 18 기준으로 직렬 제한한다.
- 일시적 오류와 KIS rate-limit 응답은 기존 공통 재시도 정책을 적용한다.
- 요청별 기본 타임아웃은 15초이며, 호출부에서 `timeoutMs`로 조정할 수 있다.
- HTTP 응답, 원문 문자열, JSON 파싱 결과를 함께 반환해 오류를 수치화하고 재현할 수 있다.

## 사용 예

```ts
const result = await kisRequest<any>({
  url,
  token,
  trId: "FHKST03010100",
  timeoutMs: 30_000,
});

if (!result.response.ok || result.parsed?.rt_cd !== "0") {
  // result.rawText와 result.parsed를 진단에 사용
}
```

## 적용 모듈

국내·해외 일봉, 국내 분봉, 국내 차트, 국내 순위, 해외 일봉, 해외 순위 호출은 공통 프레임워크를 사용한다. 추가 KIS 데이터 API도 직접 `fetch`하지 말고 같은 경계를 사용해야 한다.

OAuth 토큰 발급 엔드포인트는 access token과 `tr_id`가 없는 별도 인증 프로토콜이므로 `lib/kis-token.ts`에 독립적으로 둔다. 단, 토큰 발급도 기존 단일 발급·DB 잠금·재사용 정책을 따른다.

