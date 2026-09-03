#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${STOCKMAN_BASE_URL:-http://127.0.0.1:3000}"
CRON_SECRET="${CRON_SECRET:?CRON_SECRET is required}"
REQUEST_ID="rss-$(date -u +%Y%m%dT%H%M%SZ)-$$"

curl --fail-with-body --silent --show-error --max-time 180 \
  -H "x-cron-secret: ${CRON_SECRET}" \
  -H "x-request-id: ${REQUEST_ID}" \
  -H "x-cron-run-id: ${REQUEST_ID}" \
  -X POST "${BASE_URL}/api/cron/market-rss"
