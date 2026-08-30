CREATE TABLE IF NOT EXISTS inquiries (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  author_key TEXT NOT NULL,
  ip_address TEXT NOT NULL,
  user_agent TEXT NOT NULL DEFAULT '',
  view_count INTEGER NOT NULL DEFAULT 0,
  like_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS inquiries_created_idx ON inquiries(created_at DESC);
CREATE TABLE IF NOT EXISTS inquiry_comments (
  id BIGSERIAL PRIMARY KEY,
  inquiry_id BIGINT NOT NULL REFERENCES inquiries(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  author_key TEXT NOT NULL,
  ip_address TEXT NOT NULL,
  user_agent TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS inquiry_comments_inquiry_idx ON inquiry_comments(inquiry_id, created_at ASC);
CREATE TABLE IF NOT EXISTS inquiry_likes (
  id BIGSERIAL PRIMARY KEY,
  inquiry_id BIGINT NOT NULL REFERENCES inquiries(id) ON DELETE CASCADE,
  user_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(inquiry_id, user_key)
);
