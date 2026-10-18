#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${STOCKMAN_BASE_URL:-http://127.0.0.1:3000}"
CRON_SECRET="${CRON_SECRET:?CRON_SECRET is required}"
RUN_ID="${CRON_RUN_ID:-fundamentals-$(date -u +%Y%m%dT%H%M%SZ)-$$}"
REQUEST_ID="${RUN_ID}:instrument-fundamentals"
START_MS="$(date +%s%3N)"

if output=$(curl --fail-with-body --silent --show-error --max-time 15300 \
  -H "x-cron-secret: ${CRON_SECRET}" \
  -H "x-request-id: ${REQUEST_ID}" \
  -H "x-cron-run-id: ${RUN_ID}" \
  -X POST "${BASE_URL}/api/cron/instrument-fundamentals" 2>&1); then
  duration_ms=$(( $(date +%s%3N) - START_MS ))
  if [[ "$output" =~ \"ok\"[[:space:]]*:[[:space:]]*false ]]; then
    printf '[Cron] instrument-fundamentals failed requestId=%s durationMs=%s application_response=%s\n' "$REQUEST_ID" "$duration_ms" "$output" >&2
    exit 1
  elif [[ "$output" =~ \"skipped\"[[:space:]]*:[[:space:]]*true ]]; then
    printf '[Cron] instrument-fundamentals skipped requestId=%s durationMs=%s %s\n' "$REQUEST_ID" "$duration_ms" "$output"
  else
    printf '[Cron] instrument-fundamentals completed requestId=%s durationMs=%s %s\n' "$REQUEST_ID" "$duration_ms" "$output"
  fi
else
  exit_code=$?
  duration_ms=$(( $(date +%s%3N) - START_MS ))
  printf '[Cron] instrument-fundamentals failed requestId=%s durationMs=%s exit=%s response=%s\n' "$REQUEST_ID" "$duration_ms" "$exit_code" "$output" >&2
  exit "$exit_code"
fi
