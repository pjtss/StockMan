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
sudo install -o root -g root -m 755 deploy/oci/stockman-activate /usr/local/sbin/stockman-activate
sudo systemctl daemon-reload
sudo systemctl enable --now stockman.service
sudo systemctl enable --now stockman-cron.timer
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

HTTPS는 OCI 인스턴스 앞에 도메인과 인증서를 연결한 뒤 Certbot 또는 OCI Load Balancer에서 처리합니다.

## 5. 확인

```bash
systemctl status stockman.service
systemctl status stockman-cron.timer
journalctl -u stockman.service -f
journalctl -u stockman-cron.service -f
```
