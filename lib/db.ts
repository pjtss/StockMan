import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error("DATABASE_URL 환경변수가 설정되지 않았습니다.");
    }

    try {
      const url = new URL(databaseUrl);
      console.info("[DB] Connecting to:", `${url.hostname}${url.port ? `:${url.port}` : ""}`);
    } catch {
      console.info("[DB] Connecting to: <unparsed DATABASE_URL>");
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

let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (!dbInstance) {
    dbInstance = drizzle(getPool(), { schema });
  }
  return dbInstance;
}

export async function ensureSchema() {
  const client = await getPool().connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS automation_settings (
        key TEXT PRIMARY KEY,
        interval_seconds INTEGER NOT NULL DEFAULT 30,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      INSERT INTO automation_settings (key, interval_seconds)
      VALUES ('global', 30)
      ON CONFLICT (key) DO NOTHING;
    `);
    await client.query(`CREATE TABLE IF NOT EXISTS us_turnover_filter_settings (key TEXT PRIMARY KEY, settings JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());`);
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
        issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL
      );
    `);

    await client.query(`
      ALTER TABLE kis_tokens
      ADD COLUMN IF NOT EXISTS issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
      CREATE TABLE IF NOT EXISTS us_turnover_ratio_snapshots (
        id BIGSERIAL PRIMARY KEY,
        market TEXT NOT NULL DEFAULT 'AMS',
        code TEXT NOT NULL,
        name TEXT NOT NULL DEFAULT '',
        market_cap DOUBLE PRECISION NOT NULL,
        trading_value DOUBLE PRECISION NOT NULL,
        turnover_ratio DOUBLE PRECISION NOT NULL,
        observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (market, code, observed_at)
      );
    `);
    await client.query(`
      ALTER TABLE us_turnover_ratio_snapshots
      ADD COLUMN IF NOT EXISTS market TEXT NOT NULL DEFAULT 'AMS'
    `);
    await client.query(`
      DROP INDEX IF EXISTS us_turnover_ratio_snapshot_code_time
    `);
    await client.query(`
      ALTER TABLE us_turnover_ratio_snapshots
      DROP CONSTRAINT IF EXISTS us_turnover_ratio_snapshots_code_observed_at_key
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS us_turnover_ratio_snapshot_market_code_time
      ON us_turnover_ratio_snapshots (market, code, observed_at)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS us_turnover_ratio_snapshots_code_observed_idx
      ON us_turnover_ratio_snapshots (code, observed_at DESC);
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS us_turnover_ratio_blacklist (
        ticker TEXT PRIMARY KEY,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS sec_automation_events (
        external_id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        claimed_at TIMESTAMPTZ,
        delivered_at TIMESTAMPTZ,
        last_error TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
      ALTER TABLE push_subscriptions
      ADD COLUMN IF NOT EXISTS intensity_enabled BOOLEAN NOT NULL DEFAULT TRUE
    `);

    await client.query(`
      ALTER TABLE push_subscriptions
      ADD COLUMN IF NOT EXISTS rising_enabled BOOLEAN NOT NULL DEFAULT TRUE
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS filings_source_date_idx
      ON filings (source, published_date_seoul DESC, published_at DESC);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS kis_cache (
        key TEXT PRIMARY KEY,
        data JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS feature_flags (
        key TEXT PRIMARY KEY,
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS kis_api_configs (
        key TEXT PRIMARY KEY,
        config JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS us_top_rising_config (
        key TEXT PRIMARY KEY,
        top_n INTEGER NOT NULL DEFAULT 10,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS scanner_schedules (
        key TEXT PRIMARY KEY,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS scanner_schedule_history (
        id BIGSERIAL PRIMARY KEY,
        key TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS us_turnover_symbols (
        key TEXT PRIMARY KEY,
        symbols JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      INSERT INTO us_turnover_symbols (key, symbols)
      VALUES ('default', '["AAPL","TSLA","NVDA"]')
      ON CONFLICT (key) DO NOTHING;
    `);

    await client.query(`
      INSERT INTO feature_flags (key, enabled)
      VALUES ('korean_rising_top_n', TRUE)
      ON CONFLICT (key) DO NOTHING;
    `);

    await client.query(`
      INSERT INTO feature_flags (key, enabled)
      VALUES ('us_turnover_ratio', TRUE)
      ON CONFLICT (key) DO NOTHING;
    `);

    await client.query(`
      INSERT INTO kis_api_configs (key, config)
      VALUES
        ('us_updown_rate', '{"KEYB":"","AUTH":"","EXCD":"NAS","GUBN":"1","NDAY":"0","VOL_RANG":"5","tr_id":"HHDFS76290000","custtype":"P","content_type":"application/json; charset=utf-8","authorization":"Bearer"}'),
        ('us_volume_power', '{"KEYB":"","AUTH":"","EXCD":"NAS","NDAY":"0","VOL_RANG":"5","tr_id":"HHDFS76280000","custtype":"P","content_type":"application/json; charset=utf-8","authorization":"Bearer"}'),
        ('us_price_detail', '{"AUTH":"","EXCD":"AMS","tr_id":"HHDFS76200200","custtype":"P","content_type":"application/json; charset=utf-8","authorization":"Bearer"}')
      ON CONFLICT (key) DO NOTHING;
    `);

    await client.query(`
      INSERT INTO us_top_rising_config (key, top_n)
      VALUES ('default', 10)
      ON CONFLICT (key) DO NOTHING;
    `);

    await client.query(`
      INSERT INTO scanner_schedules (key, start_time, end_time)
      VALUES
        ('dart', '00:00', '23:59'),
        ('us_trading_intensity', '17:00', '02:00'),
        ('domestic_trading_intensity', '08:00', '15:30'),
        ('us_top_rising', '17:00', '02:00')
        ,('us_turnover_ratio', '17:00', '02:00')
      ON CONFLICT (key) DO NOTHING;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS top_rising_stocks (
        code TEXT PRIMARY KEY,
        company TEXT NOT NULL,
        change_rate TEXT NOT NULL,
        price TEXT NOT NULL,
        added_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS top_intensity_stocks (
        code TEXT PRIMARY KEY,
        company TEXT NOT NULL,
        intensity INTEGER NOT NULL,
        price TEXT NOT NULL,
        change_rate TEXT NOT NULL,
        added_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
  } finally {
    client.release();
  }
}
