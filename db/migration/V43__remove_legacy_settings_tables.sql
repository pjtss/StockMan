-- V42가 기존 값을 feature_module_settings로 이관한 뒤에만 제거한다.
-- 현재 런타임과 관리자 UI는 이 테이블을 읽거나 쓰지 않는다.
DROP TABLE IF EXISTS scanner_schedule_history;
DROP TABLE IF EXISTS scanner_schedules;
DROP TABLE IF EXISTS feature_flags;
DROP TABLE IF EXISTS automation_settings;
