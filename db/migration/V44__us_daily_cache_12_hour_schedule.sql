-- 일봉 캐시는 비용이 큰 전체 종목 갱신이므로 12시간 간격으로 실행한다.
-- 기존 feature_module_settings 값이 이미 존재하는 운영 DB에도 동일 정책을 적용한다.
UPDATE feature_module_settings
SET settings = settings || jsonb_build_object(
  'startTime', '00:00',
  'endTime', '23:59',
  'intervalSeconds', 43200,
  'activeDays', jsonb_build_array(1, 2, 3, 4, 5)
), updated_at = NOW()
WHERE module_key = 'us-daily-cache';
