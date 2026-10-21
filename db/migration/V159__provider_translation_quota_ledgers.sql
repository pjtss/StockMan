ALTER TABLE translation_usage_monthly ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'google-cloud-translation';
ALTER TABLE translation_usage_monthly DROP CONSTRAINT IF EXISTS translation_usage_monthly_pkey;
ALTER TABLE translation_usage_monthly ADD CONSTRAINT translation_usage_monthly_pkey PRIMARY KEY (provider, usage_month);

CREATE TABLE IF NOT EXISTS translation_usage_reservations (
  id BIGSERIAL PRIMARY KEY,
  provider TEXT NOT NULL,
  character_count INTEGER NOT NULL CHECK (character_count > 0),
  reserved_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS translation_usage_reservations_provider_time_idx
  ON translation_usage_reservations (provider, reserved_at DESC);

DELETE FROM translation_usage_reservations WHERE reserved_at < NOW() - INTERVAL '2 hours';
