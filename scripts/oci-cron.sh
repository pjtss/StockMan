#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${STOCKMAN_BASE_URL:-http://127.0.0.1:3000}"
CRON_SECRET="${CRON_SECRET:?CRON_SECRET is required}"

TOTAL_COUNT=0
SUCCESS_COUNT=0
FAILED_COUNT=0
SKIPPED_COUNT=0
START_MS="$(date +%s%3N)"
CRON_RUN_ID="${CRON_RUN_ID:-cron-$(date -u +%Y%m%dT%H%M%SZ)-$$}"

run_cron_endpoint() {
  local label="$1"
  local timeout="$2"
  local path="$3"
  local output
  local exit_code
  local request_id="${CRON_RUN_ID}:${label}"
  local endpoint_start_ms
  local duration_ms
  TOTAL_COUNT=$((TOTAL_COUNT + 1))
  endpoint_start_ms="$(date +%s%3N)"

  if output=$(curl --fail-with-body --silent --show-error --max-time "$timeout" \
    -H "x-cron-secret: ${CRON_SECRET}" \
    -H "x-request-id: ${request_id}" \
    -H "x-cron-run-id: ${CRON_RUN_ID}" \
    -X POST "${BASE_URL}${path}" 2>&1); then
    duration_ms=$(( $(date +%s%3N) - endpoint_start_ms ))
    # A few cron routes intentionally return HTTP 2xx for a controlled
    # no-op, while other routes may expose an application-level failure in a
    # JSON body. Classify the body so CronSummary reflects the actual result
    # instead of treating every HTTP 2xx as success.
    if [[ "$output" =~ \"ok\"[[:space:]]*:[[:space:]]*false ]]; then
      FAILED_COUNT=$((FAILED_COUNT + 1))
      printf '[Cron] %s failed requestId=%s durationMs=%s application_response=%s\n' "$label" "$request_id" "$duration_ms" "$output" >&2
    elif [[ "$output" =~ \"skipped\"[[:space:]]*:[[:space:]]*true ]]; then
      SKIPPED_COUNT=$((SKIPPED_COUNT + 1))
      printf '[Cron] %s skipped requestId=%s durationMs=%s %s\n' "$label" "$request_id" "$duration_ms" "$output"
    else
      SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
      printf '[Cron] %s success requestId=%s durationMs=%s %s\n' "$label" "$request_id" "$duration_ms" "$output"
    fi
  else
    exit_code=$?
    duration_ms=$(( $(date +%s%3N) - endpoint_start_ms ))
    FAILED_COUNT=$((FAILED_COUNT + 1))
    printf '[Cron] %s failed requestId=%s durationMs=%s exit=%s response=%s\n' "$label" "$request_id" "$duration_ms" "$exit_code" "$output" >&2
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

run_cron_endpoint "us-daily-open-cache" 300 "/api/cron/us-daily-open-cache"

run_cron_endpoint "us-daily-breakout" 120 "/api/cron/us-daily-breakout"

run_cron_endpoint "us-daily-indicators" 180 "/api/cron/us-daily-indicators"

run_cron_endpoint "us-bollinger-band" 180 "/api/cron/us-bollinger-band"

ELAPSED_MS=$(( $(date +%s%3N) - START_MS ))
printf '[CronSummary] total=%s success=%s failed=%s skipped=%s elapsedMs=%s\n' \
  "$TOTAL_COUNT" "$SUCCESS_COUNT" "$FAILED_COUNT" "$SKIPPED_COUNT" "$ELAPSED_MS"

if (( FAILED_COUNT > 0 )); then
  exit 1
fi
