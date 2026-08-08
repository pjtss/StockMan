#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${STOCKMAN_BASE_URL:-http://127.0.0.1:3000}"
CRON_SECRET="${CRON_SECRET:?CRON_SECRET is required}"

TOTAL_COUNT=0
SUCCESS_COUNT=0
FAILED_COUNT=0
SKIPPED_COUNT=0
START_MS="$(date +%s%3N)"

run_cron_endpoint() {
  local label="$1"
  local timeout="$2"
  local path="$3"
  local output
  local exit_code
  TOTAL_COUNT=$((TOTAL_COUNT + 1))

  if output=$(curl --fail-with-body --silent --show-error --max-time "$timeout" \
    -H "x-cron-secret: ${CRON_SECRET}" \
    -X POST "${BASE_URL}${path}" 2>&1); then
    SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
    printf '[Cron] %s success %s\n' "$label" "$output"
  else
    exit_code=$?
    FAILED_COUNT=$((FAILED_COUNT + 1))
    printf '[Cron] %s failed exit=%s response=%s\n' "$label" "$exit_code" "$output" >&2
  fi
}

run_cron_endpoint "discord-delivery-retry" 50 "/api/cron/discord-delivery-retry"

run_cron_endpoint "sync-filings" 50 "/api/cron/sync-filings"
# sync-filings is DART-only. SEC EDGAR RSS is handled by market-rss below,
# while SEC Submissions is handled by the separate sec-edgar call.

# The route resolves CIKs from the feature-module settings first and falls
# back to SEC_SYNC_CIKS. Always call it so CIKs saved in the admin UI work
# without requiring a duplicate environment-variable configuration.
run_cron_endpoint "sec-edgar" 180 "/api/cron/sec-edgar"

run_cron_endpoint "us-turnover-ratio" 50 "/api/cron/us-turnover-ratio"

run_cron_endpoint "us-turnover-watchlist" 120 "/api/cron/us-turnover-watchlist"

run_cron_endpoint "us-vwap" 180 "/api/cron/us-vwap"

run_cron_endpoint "us-trade-intensity" 120 "/api/cron/us-trade-intensity"

if [[ -n "${ALPACA_API_KEY:-}" && -n "${ALPACA_API_SECRET:-}" ]]; then
  run_cron_endpoint "short-borrow" 50 "/api/cron/short-borrow"
else
  SKIPPED_COUNT=$((SKIPPED_COUNT + 1))
  echo "[Cron] Alpaca credentials are not configured; skipping short-borrow collection" >&2
fi

run_cron_endpoint "check-bullish" 50 "/api/cron/check-bullish"

run_cron_endpoint "us-news-radar" 50 "/api/cron/us-news-radar"

run_cron_endpoint "us-breaking-news-forwarder" 50 "/api/cron/us-breaking-news-forwarder"

run_cron_endpoint "market-rss" 180 "/api/cron/market-rss"

run_cron_endpoint "us-obv" 120 "/api/cron/us-obv"

run_cron_endpoint "us-daily-cache" 300 "/api/cron/us-daily-cache"

run_cron_endpoint "us-daily-breakout" 120 "/api/cron/us-daily-breakout"

run_cron_endpoint "us-daily-indicators" 180 "/api/cron/us-daily-indicators"

ELAPSED_MS=$(( $(date +%s%3N) - START_MS ))
printf '[CronSummary] total=%s success=%s failed=%s skipped=%s elapsedMs=%s\n' \
  "$TOTAL_COUNT" "$SUCCESS_COUNT" "$FAILED_COUNT" "$SKIPPED_COUNT" "$ELAPSED_MS"

if (( FAILED_COUNT > 0 )); then
  exit 1
fi
