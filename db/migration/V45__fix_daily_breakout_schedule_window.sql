-- 기존 09:01 단일 시각 표현은 구간 판정에서 항상 비활성화되므로 1분 구간으로 정규화한다.
UPDATE feature_module_settings
SET settings = settings || jsonb_build_object('endTime', '09:02'), updated_at = NOW()
WHERE module_key = 'us-daily-breakout'
  AND settings ->> 'startTime' = '09:01'
  AND settings ->> 'endTime' = '09:01';
