ALTER TABLE push_subscriptions
  ADD COLUMN preview_mode TEXT NOT NULL DEFAULT 'GENERIC',
  ADD COLUMN preference_revision INTEGER NOT NULL DEFAULT 1;
