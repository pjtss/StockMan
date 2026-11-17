# OCI 배포

## Flyway 스키마 관리

데이터베이스 DDL은 Flyway만 관리합니다. Next.js 프로세스는 데이터베이스
연결만 확인하며 런타임에 테이블을 생성하거나 변경하지 않습니다.

OCI 인스턴스에 Docker를 설치해야 합니다. Flyway CLI나 Java는 호스트에
설치하지 않습니다. 배포 스크립트가 `flyway/flyway` Docker 컨테이너를
실행합니다. `sudo /usr/local/sbin/stockman-activate` 환경에서 `docker`
명령이 실행되어야 합니다. 배포 스크립트는
`/etc/stockman/stockman.env`를 읽어 `DATABASE_URL`에 번들된 migration을
먼저 적용하고, Flyway 컨테이너의 `migrate`가 성공한 경우에만 Stockman을 재시작합니다.
배포 시 이력상 현재 버전보다 낮은 migration은 재실행하지 않습니다. 기존 스키마에
이미 반영됐지만 Flyway 이력에서 누락된 과거 migration은 `*:ignored` 패턴으로
검증에서 제외합니다. `migrate`의 낮은 version migration 처리와 이 검증 옵션은 서로
다릅니다. Flyway의 `outOfOrder` 기본값은 `false`이므로 현재 버전보다 낮은 미적용
migration은 기본적으로 적용되지 않습니다. 새 버전 migration은 순서대로 적용합니다. 과거 migration을
뒤늦게 실행해 기존 relation과 충돌하는 일을 방지합니다.

기존 런타임 bootstrap으로 이미 스키마가 생성된 데이터베이스는 최초 1회만
baseline 처리합니다.

```bash
sudo bash -lc 'set -a; . /etc/stockman/stockman.env; set +a; docker run --rm --network host -v /opt/stockman/current/db/migration:/flyway/sql:ro flyway/flyway:latest -url="$DATABASE_URL" -locations=filesystem:/flyway/sql baseline -baselineVersion=1'
```

빈 데이터베이스에는 `baseline`을 실행하지 말고 배포 시 `migrate`를 사용합니다.

## 1. 빌드

CI 또는 로컬의 빌드 머신에서 실행합니다.

```bash
npm ci
npm run build
```

OCI에는 다음 항목을 배포합니다.

- `.next-deploy-verify/standalone`
- `.next-deploy-verify/static` -> `.next-deploy-verify/standalone/.next-deploy-verify/static`
- `public` -> `.next-deploy-verify/standalone/public`
- `scripts/oci-cron.sh`

`public`에는 외부 API discovery 파일(`/openapi.json`, `/api-reference.md`, `/llms.txt`)이 포함된다. 배포 smoke verification은 standalone에서 세 파일이 HTTP 200으로 제공되고 OpenAPI 공개 경로가 유지되는지 확인한다.

1GB 인스턴스에서 `next build`를 반복 실행하지 않고, 빌드된 standalone 결과만 배포합니다.

## 2. 환경변수

`/etc/stockman/stockman.env`에 운영 환경변수를 저장합니다. 파일 권한은 `root:stockman`, `640`으로 제한합니다.

필수 값:

```dotenv
NODE_ENV=production
DATABASE_URL=...
CRON_SECRET=...
KIS_APPKEY=...
KIS_APPSECRET=...
US_TURNOVER_RATIO_NEW_DISCORD_WEBHOOK_URL=...
US_TURNOVER_RATIO_INCREASE_DISCORD_WEBHOOK_URL=...
```

현재 프로젝트에서 사용하는 DART, SEC, Web Push 관련 환경변수도 함께 등록합니다.

## 3. 서비스 설치

```bash
sudo useradd --system --home /opt/stockman --shell /usr/sbin/nologin stockman
sudo mkdir -p /opt/stockman/current /etc/stockman
sudo chown -R stockman:stockman /opt/stockman
sudo chmod 640 /etc/stockman/stockman.env
sudo cp deploy/oci/stockman.service /etc/systemd/system/
sudo cp deploy/oci/stockman-cron.service /etc/systemd/system/
sudo cp deploy/oci/stockman-cron.timer /etc/systemd/system/
sudo cp deploy/oci/stockman-rss.service /etc/systemd/system/
sudo cp deploy/oci/stockman-rss.timer /etc/systemd/system/
sudo install -o root -g root -m 755 deploy/oci/stockman-activate /usr/local/sbin/stockman-activate
sudo systemctl daemon-reload
sudo systemctl enable --now stockman.service
sudo systemctl enable --now stockman-cron.timer
sudo systemctl enable --now stockman-rss.timer
```

GitHub Actions가 배포 교체 작업만 수행할 수 있도록 `sudoers`에 다음을 추가합니다.

활성화 스크립트는 archive 추출 전에 gzip/tar 전체 목록을 읽어 무결성을 검사합니다. 추출은 tar의 기본 경로 보호를 유지하고 `--absolute-names`/`-P`를 사용하지 않습니다. 검사에 실패하면 원본 archive를 유지하고 기존 release를 바꾸지 않습니다. 이후 기존 `/opt/stockman/current`를 옮기기 전에 새 release의 필수 server, timer/service, cron entry 파일, 버전형 Flyway SQL migration 및 Bash 문법을 확인합니다. 이 검증과 Flyway migration이 실패하면 현재 release는 그대로 유지되고 staging 디렉터리는 정리됩니다. `current`가 없고 `.previous`만 남아 있으면 배포 사전 검증 전에 이전 release를 복구합니다. release 디렉터리 교체 자체가 실패하거나 두 rename 사이에 HUP/INT/TERM으로 종료되면 `.previous` release를 기존 경로로 복구합니다. 복구 후에도 남은 staging 디렉터리는 제거합니다. 교체 후 systemd restart가 실패하면 이전 release는 `.previous`에 남아 수동 복구할 수 있으며 DB migration은 자동 rollback하지 않습니다. 서비스가 active가 된 뒤에는 localhost `/api/health`가 HTTP 200을 반환할 때까지 최대 60회 확인하며, endpoint는 DB 연결·스키마·Flyway 이력·필수 환경변수 상태를 반영합니다. systemd active만 되고 애플리케이션이 degraded/503이면 activation은 실패하고 상태/journal 진단을 남깁니다. GitHub Actions는 배포 workflow의 동시 실행은 직렬화하되, 원격 activation 도중 새 실행이 진행 중인 배포를 취소하지 않도록 설정합니다. activation 단계 제한 30분은 Flyway 최대 10분, HTTP readiness 재시도 최대 약 7분 및 서비스 설정 시간을 포함합니다.

GitHub Actions는 archive 회귀 검사 전에 `tar --version`을 로그에 남기고 GNU tar가 아니면 workflow를 중단한다. `cron:check`는 그 runner의 GNU tar로 archive 무결성 및 staging 경로 containment 회귀를 수행한다.

Flyway 실패 로그는 사전조건 확인을 `stage=flyway-preflight`, 실제 Docker/Flyway 실행을 `stage=flyway-migrate`로 구분한다. 운영 장애를 분류할 때 Docker CLI·`/etc/stockman/stockman.env`·`DATABASE_URL` 설정 문제와 migration 실행 실패를 이 단계값과 앞선 오류 메시지로 나눠 확인한다.

`stage=service-restart` 실패 시 activation은 web/cron/RSS/fundamentals 서비스 및 timer 상태를 출력하고, 네 개 서비스 journal의 최근 40행을 함께 남긴다. 이 진단 명령 실패는 원래 activation 종료 코드를 덮지 않는다.

애플리케이션 readiness는 systemd active와 별도로 `GET http://127.0.0.1:3000/api/health` HTTP 200을 요구한다. 이 공개 health route는 DB/schema/Flyway/필수 env 상태를 확인하고 비정상 시 503을 반환하므로, readiness 실패는 포트가 열렸지만 앱의 운영 의존성이 준비되지 않은 상태도 탐지한다.

```text
ubuntu ALL=(root) NOPASSWD: /usr/local/sbin/stockman-activate *
```

## 4. Nginx

```bash
sudo cp deploy/oci/nginx-stockman.conf /etc/nginx/conf.d/stockman.conf
sudo nginx -t
sudo systemctl enable --now nginx
sudo systemctl reload nginx
```

`nginx-stockman.conf`에는 종목 마스터 파일 업로드를 위해 `client_max_body_size 20m`이 설정되어 있습니다. 기존 운영 서버에 이미 설정 파일이 설치되어 있다면 파일을 다시 복사한 뒤 `nginx -t`와 `systemctl reload nginx`를 실행해야 합니다.

HTTPS는 OCI 인스턴스 앞에 도메인과 인증서를 연결한 뒤 Certbot 또는 OCI Load Balancer에서 처리합니다.

## 5. 확인

```bash
systemctl status stockman.service
systemctl status stockman-cron.timer
systemctl status stockman-rss.timer
journalctl -u stockman.service -f
journalctl -u stockman-cron.service -f
journalctl -u stockman-rss.service -n 50 --no-pager
```

RSS timer는 1분마다 `/api/cron/market-rss`를 전용 scheduler 헤더와 함께 호출합니다. cron은 GlobeNewswire, StockTitan, SEC를 고정 수집하고, 오래된 기사부터 실행당 최대 20건의 제목을 번역한 뒤 한국어 제목 검증을 통과한 최대 20건을 Discord로 발송합니다. 배치 크기는 RSS API route에서 20건으로 고정해 앱 프로세스의 오래된 환경변수가 backlog 처리를 막지 않게 합니다. Azure 결과가 제목 검증에 실패하면 설정된 Google 번역 provider를 한 번 더 시도합니다. 각 요청의 실행 시간은 자동화 run으로 감시하고, 남은 backlog는 다음 timer 실행이 이어 처리하며 응답의 `backlogRemaining`으로 확인합니다. 요약과 본문은 번역하지 않고 원문 그대로 유지합니다. 전체 기사 재색인을 수행하는 별도 Bullish RSS mirror 동기화는 bounded 알림 cron에서 실행하지 않습니다. Discord의 동적 rate limit 응답은 기존 retry queue가 처리합니다. 운영 freshness를 조사할 때는 timer의 `Active` 상태만으로 성공을 판단하지 말고, `stockman-rss.service` journal의 HTTP/application 응답과 `/api/debug/automation-runs?module=market-rss&limit=20`의 마지막 실행을 함께 확인합니다. `market-rss` 실행이 오래됐으면 timer 활성화, 서비스 응답, 실행 로그 순으로 확인합니다.
## RSS 제목 번역 설정

현재 RSS 번역은 Azure Translator F0를 우선 사용하고 Google Cloud Translation Basic v2를 fallback으로 사용한다. Azure를 활성화할 때 운영 환경변수 파일 `/etc/stockman/stockman.env`에 `AZURE_TRANSLATOR_API_KEY`, `AZURE_TRANSLATOR_ENDPOINT`, `AZURE_TRANSLATOR_FREE_TIER_CONFIRMED=F0`를 설정한다. 지역/멀티서비스 resource에서 요구되는 경우 `AZURE_TRANSLATOR_REGION`도 설정한다. F0 확인값이 정확히 `F0`가 아니면 Azure 요청은 실행되지 않아 S1 종량제 resource 오설정을 차단한다. `GOOGLE_TRANSLATION_API_KEY`는 예비 provider이며 기본 설정에서 Azure를 사용할 수 없을 때 번역에 사용한다. 두 provider가 미설정이거나 모두 실패하면 RSS는 계속 수집되지만 한국어 번역 전 Discord 발송은 보류된다. 환경변수 변경 후 웹 앱 프로세스를 재시작한다. 키 값은 로그나 debug 응답에 공개하지 않는다.

```bash
sudo systemctl restart stockman.service
```

Azure F0 한도 보호와 공식 문서 URL은 [`docs/rss-translation-design.md`](../../docs/rss-translation-design.md)를 참고한다. Azure와 Google 모두 앱 내부 provider별 DB quota를 사용하며, 관리자 미리보기도 quota를 우회하지 않는다. Google API key는 HTTPS body 외 URL query가 아닌 `x-goog-api-key` header로 전달한다. `TRANSLATION_PROVIDER`, `LIBRETRANSLATE_URL`, `LIBRETRANSLATE_API_KEY`는 현재 RSS 번역의 유효한 설정이 아니다. 저장소의 `libretranslate.compose.yml`과 설치 스크립트는 미사용 레거시이므로 새로 설치하거나 실행하지 않는다.
