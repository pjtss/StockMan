#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/cron-response-classifier.sh"

BASE_URL="${STOCKMAN_BASE_URL:-http://127.0.0.1:3000}"
CRON_SECRET="${CRON_SECRET:?CRON_SECRET is required}"

TOTAL_COUNT=0
SUCCESS_COUNT=0
FAILED_COUNT=0
SKIPPED_COUNT=0
DEFERRED_ENDPOINT_COUNT=0
START_MS="$(date +%s%3N)"
CRON_RUN_ID="${CRON_RUN_ID:-cron-$(date -u +%Y%m%dT%H%M%SZ)-$$}"

print_cron_summary() {
  printf '[CronSummary] total=%s success=%s failed=%s skipped=%s deferredEndpoints=%s elapsedMs=%s\n' \
    "$TOTAL_COUNT" "$SUCCESS_COUNT" "$FAILED_COUNT" "$SKIPPED_COUNT" "$DEFERRED_ENDPOINT_COUNT" "$1"
}

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
    track_cron_deferred_response "$output"
    if [[ "$output" =~ \"ok\"[[:space:]]*:[[:space:]]*false ]]; then
      FAILED_COUNT=$((FAILED_COUNT + 1))
      if (( CRON_RESPONSE_HAS_DEFERRED )); then
        printf '[Cron] %s failed-with-deferred requestId=%s durationMs=%s application_response=%s\n' "$label" "$request_id" "$duration_ms" "$output" >&2
      else
        printf '[Cron] %s failed requestId=%s durationMs=%s application_response=%s\n' "$label" "$request_id" "$duration_ms" "$output" >&2
      fi
    elif [[ "$output" =~ \"skipped\"[[:space:]]*:[[:space:]]*true ]]; then
      SKIPPED_COUNT=$((SKIPPED_COUNT + 1))
      if (( CRON_RESPONSE_HAS_DEFERRED )); then
        printf '[Cron] %s skipped-with-deferred requestId=%s durationMs=%s %s\n' "$label" "$request_id" "$duration_ms" "$output"
      else
        printf '[Cron] %s skipped requestId=%s durationMs=%s %s\n' "$label" "$request_id" "$duration_ms" "$output"
      fi
    elif (( CRON_RESPONSE_HAS_DEFERRED )); then
      SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
      printf '[Cron] %s success-with-deferred requestId=%s durationMs=%s %s\n' "$label" "$request_id" "$duration_ms" "$output"
    else
      SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
      printf '[Cron] %s success requestId=%s durationMs=%s %s\n' "$label" "$request_id" "$duration_ms" "$output"
    fi
  else
    exit_code=$?
    duration_ms=$(( $(date +%s%3N) - endpoint_start_ms ))
    FAILED_COUNT=$((FAILED_COUNT + 1))
    track_cron_deferred_response "$output"
    if (( CRON_RESPONSE_HAS_DEFERRED )); then
      printf '[Cron] %s failed-with-deferred requestId=%s durationMs=%s exit=%s response=%s\n' "$label" "$request_id" "$duration_ms" "$exit_code" "$output" >&2
    else
      printf '[Cron] %s failed requestId=%s durationMs=%s exit=%s response=%s\n' "$label" "$request_id" "$duration_ms" "$exit_code" "$output" >&2
    fi
  fi
}

if [[ "${CRON_SCRIPT_SOURCE_ONLY:-0}" != "1" ]]; then
# Start each cycle with health and retention checks before time-sensitive work.
run_cron_endpoint "health-probe-snapshot" 20 "/api/cron/health-probe-snapshot"
# Run daily candle jobs before long-running maintenance and news tasks. Their
# API routes enforce market-specific KST windows, so late calls can miss the
# only hourly invocation that falls inside the configured window.
run_cron_endpoint "kr-daily-cache" 3600 "/api/cron/kr-daily-cache"
run_cron_endpoint "us-daily-cache" 3600 "/api/cron/us-daily-cache"
run_cron_endpoint "us-exchange-status" 120 "/api/cron/us-exchange-status"
run_cron_endpoint "db-retention" 60 "/api/cron/db-retention"
run_cron_endpoint "sec-company-facts" 900 "/api/cron/sec-company-facts"

run_cron_endpoint "discord-delivery-retry" 50 "/api/cron/discord-delivery-retry"

# Run time-sensitive SEC facts, delivery retry, and news collection before the
# long candle refreshes. A delayed candle job must not block RSS collection.
run_cron_endpoint "market-rss" 180 "/api/cron/market-rss"

run_cron_endpoint "sync-filings" 50 "/api/cron/sync-filings"
# sync-filings is DART-only. SEC EDGAR RSS is handled by market-rss below,
# while SEC Submissions is handled by the separate sec-edgar call.

# The route resolves CIKs from the feature-module settings first and falls
# back to SEC_SYNC_CIKS. Always call it so stored CIK settings work
# without requiring a duplicate environment-variable configuration.
run_cron_endpoint "sec-edgar" 180 "/api/cron/sec-edgar"

run_cron_endpoint "sec-smallcap-share-facts" 900 "/api/cron/sec-smallcap-share-facts"

US_OBV_REFRESH_WEEKDAY="$(TZ=America/New_York date +%u)"
US_OBV_REFRESH_HHMM="$(TZ=America/New_York date +%H%M)"
US_OBV_REFRESH_MINUTES=$((10#${US_OBV_REFRESH_HHMM:0:2} * 60 + 10#${US_OBV_REFRESH_HHMM:2:2}))
if (( US_OBV_REFRESH_WEEKDAY <= 5 && US_OBV_REFRESH_MINUTES >= 18 * 60 + 10 )); then
  run_cron_endpoint "us-obv-divergence-snapshot" 600 "/api/cron/us-obv-divergence-snapshot"
fi
run_cron_endpoint "us-bollinger-band" 180 "/api/cron/us-bollinger-band"
run_cron_endpoint "us-bollinger-middle-lower" 180 "/api/cron/us-bollinger-middle-lower"
run_cron_endpoint "us-golden-cross" 180 "/api/cron/us-golden-cross"

run_cron_endpoint "us-daily-open-cache" 300 "/api/cron/us-daily-open-cache"

run_cron_endpoint "us-daily-breakout" 120 "/api/cron/us-daily-breakout"


run_cron_endpoint "us-minute-bollinger-band" 180 "/api/cron/us-minute-bollinger-band"
run_cron_endpoint "us-minute-obv-adl" 180 "/api/cron/us-minute-obv-adl"

run_cron_endpoint "kr-bollinger-band" 180 "/api/cron/kr-bollinger-band"
run_cron_endpoint "kr-bollinger-middle-lower" 180 "/api/cron/kr-bollinger-middle-lower"
run_cron_endpoint "kr-golden-cross" 180 "/api/cron/kr-golden-cross"

ELAPSED_MS=$(( $(date +%s%3N) - START_MS ))
print_cron_summary "$ELAPSED_MS"

if (( FAILED_COUNT > 0 )); then
  exit 1
fi
fi
