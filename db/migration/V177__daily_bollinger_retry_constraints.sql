ALTER TABLE daily_bollinger_cache_retries
  ADD CONSTRAINT daily_bollinger_cache_retries_scope_check
    CHECK (scope IN ('KR', 'US')),
  ADD CONSTRAINT daily_bollinger_cache_retries_zone_check
    CHECK (zone IN ('LOWER_OR_BELOW', 'MIDDLE_TO_LOWER')),
  ADD CONSTRAINT daily_bollinger_cache_retries_status_check
    CHECK (status IN ('PENDING', 'SUCCESS')),
  ADD CONSTRAINT daily_bollinger_cache_retries_attempts_check
    CHECK (attempts >= 0);
