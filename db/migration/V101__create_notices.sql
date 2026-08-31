CREATE TABLE IF NOT EXISTS notices (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  author_key TEXT NOT NULL DEFAULT '관리자',
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_published BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE INDEX IF NOT EXISTS notices_published_idx ON notices(is_published, published_at DESC);
INSERT INTO notices (id, title, content, author_key, published_at, updated_at)
SELECT id, title, content, author_key, created_at, updated_at FROM inquiries WHERE is_notice = TRUE ON CONFLICT (id) DO NOTHING;
SELECT setval('notices_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM notices), 0) + 1, 1), false);
