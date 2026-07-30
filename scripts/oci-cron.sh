#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${STOCKMAN_BASE_URL:-http://127.0.0.1:3000}"
CRON_SECRET="${CRON_SECRET:?CRON_SECRET is required}"

curl --fail-with-body --silent --show-error --max-time 50 \
  -H "x-cron-secret: ${CRON_SECRET}" \
  -X POST "${BASE_URL}/api/cron/sync-filings"

curl --fail-with-body --silent --show-error --max-time 50 \
  -H "x-cron-secret: ${CRON_SECRET}" \
  -X POST "${BASE_URL}/api/cron/us-turnover-ratio"

curl --fail-with-body --silent --show-error --max-time 120 \
  -H "x-cron-secret: ${CRON_SECRET}" \
  -X POST "${BASE_URL}/api/cron/us-trade-intensity"

if [[ -n "${ALPACA_API_KEY:-}" && -n "${ALPACA_API_SECRET:-}" ]]; then
  curl --fail-with-body --silent --show-error --max-time 50 \
    -H "x-cron-secret: ${CRON_SECRET}" \
    -X POST "${BASE_URL}/api/cron/short-borrow"
else
  echo "[Cron] Alpaca credentials are not configured; skipping short-borrow collection" >&2
fi

curl --fail-with-body --silent --show-error --max-time 50 \
  -H "x-cron-secret: ${CRON_SECRET}" \
  -X POST "${BASE_URL}/api/cron/check-bullish"

curl --fail-with-body --silent --show-error --max-time 50 \
  -H "x-cron-secret: ${CRON_SECRET}" \
  -X POST "${BASE_URL}/api/cron/us-news-radar"

curl --fail-with-body --silent --show-error --max-time 50 \
  -H "x-cron-secret: ${CRON_SECRET}" \
  -X POST "${BASE_URL}/api/cron/us-breaking-news-forwarder"

curl --fail-with-body --silent --show-error --max-time 120 \
  -H "x-cron-secret: ${CRON_SECRET}" \
  -X POST "${BASE_URL}/api/cron/us-obv"
