import { Pool } from "pg";

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error("DATABASE_URL 환경변수가 설정되지 않았습니다.");
    }

    pool = new Pool({
      connectionString: databaseUrl,
      ssl: {
        rejectUnauthorized: false,
      },
    });
  }

  return pool;
}

export async function ensureSchema() {
  const client = await getPool().connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS filings (
        id BIGSERIAL PRIMARY KEY,
        source TEXT NOT NULL,
        external_id TEXT NOT NULL,
        company TEXT NOT NULL,
        title TEXT NOT NULL,
        judgment TEXT NOT NULL,
        form_type TEXT,
        keywords TEXT[] NOT NULL DEFAULT '{}',
        summary TEXT NOT NULL DEFAULT '',
        published_at TIMESTAMPTZ NOT NULL,
        published_date_seoul DATE NOT NULL,
        link TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (source, external_id)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS kis_tokens (
        id INT PRIMARY KEY CHECK (id = 1),
        access_token TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS alert_events (
        id BIGSERIAL PRIMARY KEY,
        source TEXT NOT NULL,
        external_id TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (source, external_id)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id BIGSERIAL PRIMARY KEY,
        endpoint TEXT NOT NULL UNIQUE,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        user_agent TEXT,
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        dart_enabled BOOLEAN NOT NULL DEFAULT TRUE,
        sec_enabled BOOLEAN NOT NULL DEFAULT TRUE,
        only_validated BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS telegram_subscribers (
        id BIGSERIAL PRIMARY KEY,
        chat_id TEXT NOT NULL UNIQUE,
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      ALTER TABLE push_subscriptions
      ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT TRUE
    `);

    await client.query(`
      ALTER TABLE push_subscriptions
      ADD COLUMN IF NOT EXISTS dart_enabled BOOLEAN NOT NULL DEFAULT TRUE
    `);

    await client.query(`
      ALTER TABLE push_subscriptions
      ADD COLUMN IF NOT EXISTS sec_enabled BOOLEAN NOT NULL DEFAULT TRUE
    `);

    await client.query(`
      ALTER TABLE push_subscriptions
      ADD COLUMN IF NOT EXISTS only_validated BOOLEAN NOT NULL DEFAULT FALSE
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS filings_source_date_idx
      ON filings (source, published_date_seoul DESC, published_at DESC);
    `);
  } finally {
    client.release();
  }
}
