#!/usr/bin/env bash

cron_response_has_deferred() {
  local response="$1"
  local entries
  if [[ "$response" =~ \"deferred\"[[:space:]]*:[[:space:]]*\{([^}]*)\} ]]; then
    entries="${BASH_REMATCH[1]}"
    [[ "$entries" =~ :[[:space:]]*true ]]
  else
    return 1
  fi
}

track_cron_deferred_response() {
  local response="$1"
  CRON_RESPONSE_HAS_DEFERRED=0
  if cron_response_has_deferred "$response"; then
    DEFERRED_ENDPOINT_COUNT=$((DEFERRED_ENDPOINT_COUNT + 1))
    CRON_RESPONSE_HAS_DEFERRED=1
  fi
}
