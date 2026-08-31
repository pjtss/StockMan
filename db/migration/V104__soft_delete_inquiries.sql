ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS inquiries_active_created_idx ON inquiries(created_at DESC) WHERE deleted_at IS NULL;
