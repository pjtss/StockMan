ALTER TABLE inquiry_likes DROP CONSTRAINT IF EXISTS inquiry_likes_inquiry_id_user_key_key;
ALTER TABLE inquiry_likes ADD COLUMN IF NOT EXISTS ip_address TEXT NOT NULL DEFAULT '';
ALTER TABLE inquiry_likes ADD COLUMN IF NOT EXISTS user_agent TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS inquiry_likes_inquiry_created_idx ON inquiry_likes(inquiry_id, created_at DESC);
