# 로컬 Codex 기반 미국 RSS·공시 급등주 분석 구조

> 상태: 구조 설계. 현재 운영 cron/번역 파이프라인을 변경하거나 배포하는 문서가 아니다.

## 목표와 범위

- Windows 노트북에서 실행하고, RSS를 1분마다 조회한다.
- 미국 RSS 원문 조회는 로컬이 직접 공급자에 접속하는 방식이 아니라 운영 서버 API를 기준으로 한다. 운영 API가 실제로 제공할 미국 출처 범위는 API 계약 구현 전에 확정한다.
- 사용자가 Codex 예약 작업을 시작하면, Codex가 로컬 프로젝트에서 매분 운영 API의 미분석 RSS를 읽고 직접 호재 여부·티커·위험을 분석한다.
- 번역 전용 서비스·LibreTranslate·Google Translation은 이 기능에서 사용하지 않는다.
- 로컬 프로젝트는 운영 API 호출·저장·Discord 전달 어댑터를 담당한다. 분석 모델은 별도 로컬 LLM 프로세스나 OpenAI API worker가 아니라 예약 실행되는 Codex 세션이다.
- RSS 원문은 운영 서버 API에서 조회한다. Codex는 후보를 받은 뒤 필요할 때 SEC·기업 이벤트·시세 API를 추가 조회하고 분석 결과를 대화로 반환한다.
- LibreTranslate는 사용하지 않는다. 번역 문구는 호재 분석을 수행한 LLM이 같은 요청에서 직접 작성한다.
- ChatGPT/Codex 세션 사용과 OpenAI API 호출은 서로 다른 실행 경로다. 이 구조에서는 `OPENAI_API_KEY`를 요구하거나 현재 ChatGPT 이용권을 API 키로 재사용한다고 가정하지 않는다.
- 기존 `LOCAL_TEST_DISCORD_WEBHOOK_URL`은 이 기능에서 사용하지 않는다. 전용 `LOCAL_RSS_BULLISH_DISCORD_WEBHOOK_URL`을 지정해야 전송한다.
- 별도 OpenAI API key나 Ollama는 사용하지 않는다. Codex 예약 작업의 모델 사용량은 Codex 플랜/워크스페이스 한도에 따른다.

## 권장 구조

```mermaid
flowchart LR
  USER[사용자 프롬프트\n예: 오늘 데이장 급등주 분석]
  CODEX[현재 Codex 세션\n조회·분석·질의 확장]
  OPSAPI[운영 서버 읽기 API\nRSS·SEC·기업 이벤트·시세]
  VALID[근거·보통주·최신성 검증]
  REPORT[매매용 리포트\n티커·호재·희석·위험·출처]
  USER --> CODEX --> OPSAPI --> VALID --> CODEX --> REPORT
```

| 구성 | 책임 |
|---|---|
| 사용자 프롬프트 | 분석 범위·시간대·시장·정렬 기준을 지정한다. |
| Codex 세션 | 운영 API를 단계적으로 조회하고, 원문과 보강 데이터의 근거를 연결해 분석한다. |
| 운영 읽기 API | RSS 원문, SEC/DART 공시, 기업 이벤트, 시세·기초정보를 읽기 전용으로 제공한다. 운영 DB 직접 접속은 허용하지 않는다. |
| 검증 계층 | 티커가 활성 `COMMON_STOCK`인지, 출처·발행시각·관측시각이 있는지, 근거가 실제 원문에 존재하는지 확인한다. |
| 결과 리포트 | 호재 유형·티커·급등주 관련 정보·워런트/증자/합병/역분할 위험·출처·미확인 항목을 함께 표시한다. 확정적 매수 신호로 표현하지 않는다. |

### 프로젝트 모듈 경계 제안

### 현재 Codex 조회 계약

기존 분석용 묶음 API와 별개로 로컬 감시 API를 둔다.

`GET /api/public/market-intelligence?ticker=ABCD&from=YYYY-MM-DD&to=YYYY-MM-DD&limit=50`

- `GET /api/local-rss-agent?kind=articles&limit=20`은 최근 30일 미분석 RSS revision만 반환한다.
- `GET /api/local-rss-agent?kind=deliveries`는 Discord 전송 대기 결과를 반환하고, `kind=status`는 전송 상태 집계를 반환한다.
- `POST /api/local-rss-agent`는 `kind=analyses` 결과 저장 또는 `kind=delivery` 상태 전이를 수행한다.
- GET은 `LOCAL_RSS_AGENT_READ_TOKEN`, POST는 `LOCAL_RSS_AGENT_WRITE_TOKEN`으로 각각 Bearer 인증한다. 공용 `CRON_SECRET`은 사용하지 않는다.
- `market_rss_llm_analyses`는 `(source, external_id, revision_hash)` 고유키로 긍정/비긍정 결과와 근거를 보존한다. RSS 제목/본문이 바뀐 수정본만 새 revision으로 다시 분석한다.
- 감시 시작 시각은 `market_rss_llm_agent_state`에 최초 기록하며 그 이후 운영 DB에 새로 적재된 기사만 처리한다. 과거 30일분이 첫 실행에서 몰려 분석·발송되는 것을 방지한다. 티커는 처음 기록이면 `NEW`, 기존 분석 이력이 있으면 `EXISTING`으로 저장·표시한다. 다른 신규 기사는 기존 ticker여도 분석과 알림을 허용한다.
- 알림은 Codex가 `POSITIVE`로 판정하고 티커가 `us_common_stock_universe`의 활성 `COMMON_STOCK`으로 확인된 경우에만 대기열에 넣는다. 확인 실패는 알림 차단이다.

- 실행/스케줄러: `scripts/local-us-rss-agent.mjs`, 설치·삭제용 `scripts/local-us-rss-task.ps1`
- 도메인: `lib/local-us-rss/types.ts`, `analysis-prompt.ts`, `analysis-validator.ts`, `worker.ts`
- 어댑터: `lib/local-us-rss/operations-api.ts`, `llm-provider.ts`, `discord-webhook.ts`, `sqlite-store.ts`
- 테스트: provider 응답 고정 mock, feed fixture, outbox 상태 전이, Task Scheduler 설정 생성 검증
- 설정은 기존 로컬 환경변수 파서 [`scripts/local-env.mjs`](../../scripts/local-env.mjs) 규칙을 따른다. 실제 비밀값은 저장소·로그·설계 문서·Discord 메시지에 출력하지 않는다.

## 실행 주기·수집·중복 방지

실행 트리거는 Codex 앱의 현재 대화에 연결된 분 단위 Scheduled Task다. 실행은 로컬 프로젝트에서 매번 한 회차씩 수행하며 Windows PC와 Codex 데스크톱 앱이 켜져 있어야 한다. Node 스크립트 자체는 Codex 모델을 호출하지 않는다. 각 회차는 RSS GET → Codex 직접 분석 → 전용 API에 분석 결과 저장 → Discord 대기 항목 claim 후 전송 순이다.

1. Windows Task Scheduler의 분 단위 trigger로 매 60초 `--once`를 실행한다. Microsoft 문서상 minute schedule의 `/mo` 기본값은 1분이며, Task Scheduler는 다중 인스턴스 정책으로 기존 실행 중 신규 시작 여부를 정할 수 있다.
2. Windows가 절전/종료/네트워크 오프라인이면 1분 주기를 보장할 수 없다. 복귀 시 지난 trigger를 각각 몰아서 재생하지 말고, 현재 RSS에 남아 있는 unseen 항목을 한 번 수집한다. 이 설계는 노트북이 깨어 있고 인터넷에 연결된 동안의 주기 실행을 보장 대상으로 삼는다.
3. 운영 API의 조회 cursor/페이지네이션 계약을 사용해 신규 원문을 가져온다. ETag 등 feed 수집 세부사항은 운영 ingestion의 책임이며, 로컬 worker가 RSS 공급자를 중복 polling하지 않는다.
4. 항목 키는 운영 API가 보장하는 `(source, externalId)`를 기준으로 한다. 같은 key와 revision은 다시 분석/발송하지 않는다.
5. 같은 RSS item의 제목/요약이 갱신되면 이전 snapshot을 덮지 않고 revision을 남긴다. 이미 보낸 기사의 수정본을 자동 재알림할지는 기본적으로 보류/미전송으로 두며, 별도 승인 정책 전까지 중복 알림을 만들지 않는다.
6. 한 번의 worker가 오래 걸려 다음 1분 trigger와 겹치면 `IgnoreNew`와 로컬 DB lease/lock으로 중복 처리를 막는다. 실행 시각·source별 fetch count·신규/중복/보류/실패 수·LLM 사용량·Discord 결과를 비밀값 없이 기록한다.

## LLM 호재 분석 및 한국어 생성 계약

- 운영 API에서 조회한 원문의 title, summary, content(존재할 때), link, source, publishedAt만 입력한다. 1차 버전은 원문 페이지 크롤링/웹 검색 도구를 호출하지 않는다. RSS 근거가 약하거나 내용이 모순되면 `INSUFFICIENT`/`MIXED`로 판단해 보내지 않는다.
- RSS 본문은 외부 비신뢰 입력이다. 본문 안의 지시문은 데이터로 취급하고 따르지 않으며, 모델 tool을 노출하지 않는다.
- 한 번의 LLM 출력에 아래 필드를 요구한다. JSON Schema/strict structured output을 지원하는 provider면 이를 사용한다.

```json
{
  "decision": "POSITIVE | MIXED | NEUTRAL | NEGATIVE | INSUFFICIENT",
  "notify": true,
  "ticker": "NVDA",
  "eventType": "계약 | 실적 | 가이던스 | 규제 | 임상 | 인수합병 | 자사주·배당 | 기타",
  "translatedTitleKo": "한국어 제목",
  "analysisKo": "무슨 일이 있었고 왜 기업 가치/매출/현금흐름에 긍정적인지, 근거와 조건을 연결해 설명",
  "evidenceQuotes": ["RSS 원문에 실제 포함된 짧은 문구"],
  "risksKo": "불확실성, 계약 조건, 희석, 일회성 여부 등. 없으면 확인 가능한 범위와 한계를 표기",
  "confidence": "HIGH | MEDIUM | LOW"
}
```

기존 `/api/bullish-rss`는 코드 분류 테이블이므로 LLM 기록 저장에 사용하지 않는다. 전용 `/api/local-rss-agent` 계약은 아래처럼 구현되었으며, 운영 배포와 서버 설정 전에는 실제 운영 호출이 불가능하다.

| 제안 경로 | 로컬 동작 | 권한·응답 핵심 |
|---|---|---|
| `GET /api/local-rss-agent?kind=articles&limit=20` | 감시 시작 후 미분석 RSS revision 조회 | `LOCAL_RSS_AGENT_READ_TOKEN`; `articles[{source,externalId,title,summary,content,link,publishedAt,revisionHash}]` |
| `POST /api/local-rss-agent` (`kind=analyses`) | Codex 결과를 운영 DB에 idempotent 저장 | `LOCAL_RSS_AGENT_WRITE_TOKEN`; revision hash가 현재 RSS와 일치해야 저장, unique conflict는 중복 무시 |
| `GET /api/local-rss-agent?kind=deliveries` + `POST kind=delivery` | 전송 대기, claim, 결과 기록 | read/write 토큰 분리; `PENDING→SENDING→SENT/FAILED/UNCERTAIN`; compare-and-set으로 중복 전송 차단 |

전용 API는 HTTPS·요청건수 제한·revision 검증으로 보호한다. 분석 결과는 별도 `market_rss_llm_analyses` 테이블에 남겨 규칙 분류값을 덮지 않는다. 비긍정도 재분석 방지를 위해 보존한다. Discord 전달도 동일 DB 상태로 관리하며, timeout은 `UNCERTAIN`으로 두고 자동 재발송하지 않는다. 운영 배포 전에는 migration V141과 서버 비밀값 설정이 필요하다.

- 실제 전송 조건은 **LLM의 `decision=POSITIVE`와 `notify=true` 둘 다**인 경우뿐이다. 코드는 이 응답을 검증하고 발송하는 역할만 하고, 키워드 점수로 호재를 재판정하지 않는다.
- `confidence`는 모델의 자기평가이지 통계적 상승확률/수익률이 아니다. UI와 Discord에서 주가 상승 확률로 표현하지 않는다.
- `evidenceQuotes`는 원문 substring인지 기계적으로 대조한다. 인용 불일치, 빈 번역, 스키마 위반, 근거 누락은 발송하지 않고 `VALIDATION_FAILED`로 저장한다.
- 분류/번역/분석이 성공해도 투자 추천 또는 가격 상승 보장이 아님을 고정 안내한다.

## 상태 전이와 재시도

```text
DISCOVERED → ANALYZING → ANALYZED_POSITIVE → DELIVERY_PENDING → SENT
                         ├→ ANALYZED_NON_POSITIVE (종료, 알림 없음)
                         └→ VALIDATION_FAILED (검수/수정 대상)
ANALYZING 실패 → RETRY_WAIT → ANALYZING
Discord 명확한 거절 → DELIVERY_RETRY → SENT | DELIVERY_FAILED
Discord 응답 유실/timeout → DELIVERY_UNCERTAIN (자동 재발송 금지, 수동 확인)
```

- LLM 429/일시 5xx/network 오류는 bounded exponential backoff와 jitter를 사용한다. 인증/요청 형식 오류는 자동 반복하지 않는다.
- Discord 요청에는 `wait=true`를 사용해 서버 확인과 생성 message body를 받으며 `allowed_mentions: { parse: [] }`를 넣는다. 원문 링크만 허용하고 RSS 텍스트는 Discord 문법/mention을 sanitize한다.
- Discord 응답 유실은 메시지가 실제 생성됐을 수 있으므로 자동 재전송하지 않고 `DELIVERY_UNCERTAIN`에 둔다. 운영자가 해당 채널을 확인한 뒤 재전송을 결정한다.
- Discord 메시지는 한국어 제목, 호재 판단 근거 2~4문장, 위험/조건, ticker·source·발행 시각·원문 링크를 포함한다. 2,000자 제한을 넘으면 안전하게 요약/절단하고 원문 분석 전체는 로컬 DB에 보존한다.

## 로컬 설정 초안

`.env.local`은 기존 dev-env 로더의 우선순위로 읽고, 아래 값은 샘플 이름만 제시한다. URL이나 key 원문을 커밋하지 않는다.

```dotenv
RSS_BULLISH_REPORT_API_BASE_URL=https://stockman.r-e.kr
LOCAL_RSS_AGENT_READ_TOKEN=전용 read credential
LOCAL_RSS_AGENT_WRITE_TOKEN=전용 write credential
LOCAL_RSS_BULLISH_DISCORD_WEBHOOK_URL=전용 Discord 채널 webhook
```

- 매 회차 최대 20개를 가져오고 초과 backlog는 다음 실행에서 처리한다. 같은 대화 heartbeat의 다음 실행까지 미완료면 예약 도구 동작에 맡기고 별도 worker 중복 실행은 금지한다.
- Codex 앱 scheduled task는 PC와 앱이 켜져 있어야 로컬 project를 사용할 수 있다. Codex 계정/플랜 사용량은 적용될 수 있으며 API key/별도 API 과금 경로는 사용하지 않는다.
- 토큰 또는 Discord URL 미설정 시 해당 작업을 실패 종료하고 비밀 원문은 로그에 남기지 않는다.

## 설치·운영·검증

- 설치 스크립트는 현재 프로젝트 root의 Node executable과 absolute script path로 Task Scheduler 작업을 등록한다. 작업 이름은 `StockMan-Local-US-RSS-LLM`; 현재 Windows 사용자로 실행한다. 등록 단계는 환경 파일/URL을 출력하지 않는다.
- Task Scheduler 다중 인스턴스 정책은 `IgnoreNew`; 놓친 실행은 복귀 후 한 번만 catch-up 한다. worker는 매분 실행 종료를 목표로 하며, 분석 queue가 밀리면 fetch loop와 분석 backlog를 분리한다.
- CLI 명령 초안: `node scripts/local-us-rss-agent.mjs --once`, `--status`, `--dry-run`, `--test-discord` (후자는 명시 실행 전까지 실제 전송 금지), `--install-task`, `--uninstall-task`.
- 검증 순서: 운영 API read/write contract 및 인증 범위 → 같은 항목 중복 실행 → LLM JSON schema/근거 실패 → provider retry/backoff → Discord 성공 및 거절 → Discord timeout uncertain → Task Scheduler 동시 실행 차단 → 실제 1분 대기 runtime smoke test.
- 실제 webhook test는 사용자 승인 후 전용 시험 채널에서 수행한다. 테스트 전송이 없으면 webhook 실작동을 검증했다고 보고하지 않는다.
- 운영 상태는 `--status`에서 마지막 성공 fetch 시각, source별 freshness, queue backlog, LLM 사용량/예산, SENT/FAILED/UNCERTAIN를 표시한다. 자격증명이나 full webhook URL은 표시하지 않는다.

## 구현 전 결정 필요

1. **운영 배포**: V141 migration, `/api/local-rss-agent`, 전용 read/write token을 함께 배포·설정해야 한다.
2. **로컬 설정**: 같은 read/write token과 별도 Discord webhook을 `.env.local`에 설정해야 한다. 현재 확인상 값은 설정되지 않았으며 기존 test webhook은 자동 채택하지 않는다.
3. **자동화 시작**: 준비 완료 후 현재 Codex 대화에서 “RSS 1분 자동감시 시작”을 요청해 local-project heartbeat를 등록한다. 정지는 “RSS 자동감시 중지” 요청이다. task 생성은 지금 수행하지 않았다.

## 공식 문서 및 현재 프로젝트 근거

- Windows minute schedule: [Microsoft `schtasks /create`](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/schtasks-create)
- Task Scheduler 중복 실행 정책: [Microsoft `TaskSettings.MultipleInstances`](https://learn.microsoft.com/en-us/windows/win32/taskschd/tasksettings-multipleinstances)
- Codex desktop scheduled tasks: [OpenAI 공식 Scheduled tasks 문서](https://learn.chatgpt.com/docs/automations)
- LLM API key 안전관리: [OpenAI API quickstart](https://platform.openai.com/docs/quickstart/make-your-first-api-request), [API authentication](https://platform.openai.com/docs/api-reference/authentication)
- 구조화 LLM 출력: [OpenAI Structured Outputs](https://platform.openai.com/docs/guides/structured-outputs)
- ChatGPT와 API 과금은 분리: [OpenAI billing FAQ](https://help.openai.com/en/articles/9039756-managing-billing-for-chatgpt-and-the-api-platform)
- Webhook 확인 응답/mentions 보호: [Discord Webhook Execute](https://docs.discord.com/developers/resources/webhook#execute-webhook)
- 기존 source adapters: [`lib/market-rss-sources.ts`](../../lib/market-rss-sources.ts)
- 기존 단일 RSS parser: [`lib/market-rss.ts`](../../lib/market-rss.ts)
- 현재 호재 목록 read/write API: [`app/api/bullish-rss/route.ts`](../../app/api/bullish-rss/route.ts)
- 현재 호재 목록 repository 및 규칙 분류 연결: [`lib/market-rss-bullish-repository.ts`](../../lib/market-rss-bullish-repository.ts)
- 현재 서버형 RSS cron(로컬 설계와는 별도): [`app/api/cron/market-rss/route.ts`](../../app/api/cron/market-rss/route.ts)
