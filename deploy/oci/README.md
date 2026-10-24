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
검증에서 제외하고, 새 버전 migration은 순서대로 적용합니다. 과거 migration을
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

- `.next/standalone`
- `.next/static` -> `.next/standalone/.next/static`
- `public` -> `.next/standalone/public`
- `scripts/oci-cron.sh`

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

RSS timer는 1분마다 `/api/cron/market-rss`를 전용 scheduler 헤더와 함께 호출합니다. cron은 GlobeNewswire, StockTitan, SEC를 고정 수집하고, 오래된 기사부터 최대 50건의 제목을 번역한 뒤 한국어 제목 검증을 통과한 최대 50건을 Discord로 발송합니다. Azure 결과가 제목 검증에 실패하면 설정된 Google 번역 provider를 한 번 더 시도합니다. 각 요청의 실행 시간은 자동화 run으로 감시하고, 남은 backlog는 다음 timer 실행이 이어 처리하며 응답의 `backlogRemaining`으로 확인합니다. 요약과 본문은 번역하지 않고 원문 그대로 유지합니다. 전체 기사 재색인을 수행하는 별도 Bullish RSS mirror 동기화는 bounded 알림 cron에서 실행하지 않습니다. Discord의 동적 rate limit 응답은 기존 retry queue가 처리합니다. 운영 freshness를 조사할 때는 timer의 `Active` 상태만으로 성공을 판단하지 말고, `stockman-rss.service` journal의 HTTP/application 응답과 `/api/debug/automation-runs?module=market-rss&limit=20`의 마지막 실행을 함께 확인합니다. `market-rss` 실행이 오래됐으면 timer 활성화, 서비스 응답, 실행 로그 순으로 확인합니다.
## RSS 제목 번역 설정

현재 RSS 번역은 Azure Translator F0를 우선 사용하고 Google Cloud Translation Basic v2를 fallback으로 사용한다. Azure를 활성화할 때 운영 환경변수 파일 `/etc/stockman/stockman.env`에 `AZURE_TRANSLATOR_API_KEY`, `AZURE_TRANSLATOR_ENDPOINT`, `AZURE_TRANSLATOR_FREE_TIER_CONFIRMED=F0`를 설정한다. 지역/멀티서비스 resource에서 요구되는 경우 `AZURE_TRANSLATOR_REGION`도 설정한다. F0 확인값이 정확히 `F0`가 아니면 Azure 요청은 실행되지 않아 S1 종량제 resource 오설정을 차단한다. `GOOGLE_TRANSLATION_API_KEY`는 예비 provider이며 기본 설정에서 Azure를 사용할 수 없을 때 번역에 사용한다. 두 provider가 미설정이거나 모두 실패하면 RSS는 계속 수집되지만 한국어 번역 전 Discord 발송은 보류된다. 환경변수 변경 후 웹 앱 프로세스를 재시작한다. 키 값은 로그나 debug 응답에 공개하지 않는다.

```bash
sudo systemctl restart stockman.service
```

Azure F0 한도 보호와 공식 문서 URL은 [`docs/rss-translation-design.md`](../../docs/rss-translation-design.md)를 참고한다. Azure와 Google 모두 앱 내부 provider별 DB quota를 사용하며, 관리자 미리보기도 quota를 우회하지 않는다. Google API key는 HTTPS body 외 URL query가 아닌 `x-goog-api-key` header로 전달한다. `TRANSLATION_PROVIDER`, `LIBRETRANSLATE_URL`, `LIBRETRANSLATE_API_KEY`는 현재 RSS 번역의 유효한 설정이 아니다. 저장소의 `libretranslate.compose.yml`과 설치 스크립트는 미사용 레거시이므로 새로 설치하거나 실행하지 않는다.
