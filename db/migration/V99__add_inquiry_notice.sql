ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS is_notice BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS inquiries_notice_created_idx ON inquiries(is_notice DESC, created_at DESC);
