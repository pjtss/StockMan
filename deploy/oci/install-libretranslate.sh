#!/usr/bin/env bash
set -euo pipefail

BASE_DIR=/opt/stockman/libretranslate
SOURCE_FILE=/opt/stockman/current/deploy/oci/libretranslate.compose.yml

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is not installed." >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  apt-get update
  apt-get install -y docker-compose-plugin
fi

if [ ! -f "$SOURCE_FILE" ]; then
  echo "Missing $SOURCE_FILE. Deploy the latest StockMan release first." >&2
  exit 1
fi

mkdir -p "$BASE_DIR"
cp "$SOURCE_FILE" "$BASE_DIR/compose.yml"
cd "$BASE_DIR"
docker compose -f compose.yml pull
docker compose -f compose.yml up -d

for attempt in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:5000/health >/dev/null; then
    echo "LibreTranslate is healthy on 127.0.0.1:5000"
    docker compose -f compose.yml ps
    exit 0
  fi
  sleep 5
done

docker compose -f compose.yml ps
docker compose -f compose.yml logs --tail=80
exit 1
