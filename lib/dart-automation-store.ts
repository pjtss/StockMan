import { getPool } from "./db";

const MAX_ATTEMPTS = 3;
const STATE_KEY = "opendart-list";
let schemaPromise: Promise<void> | null = null;

async function ensureDartAutomationStore() {
  if (!schemaPromise) {
    schemaPromise = getPool()
      .query(`
        CREATE TABLE IF NOT EXISTS dart_automation_events (
          external_id TEXT PRIMARY KEY,
          status TEXT NOT NULL,
          attempts INTEGER NOT NULL DEFAULT 0,
          claimed_at TIMESTAMPTZ,
          delivered_at TIMESTAMPTZ,
          last_error TEXT,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS dart_automation_state (
          key TEXT PRIMARY KEY,
          initialized_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `)
      .then(() => undefined)
      .catch((error) => {
        schemaPromise = null;
        throw error;
      });
  }

  await schemaPromise;
}

export async function claimDartAutomation(externalIds: string[]): Promise<Set<string>> {
  await ensureDartAutomationStore();
  const ids = [...new Set(externalIds.filter(Boolean))];
  const client = await getPool().connect();

  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [STATE_KEY]);
    const state = await client.query(
      "SELECT 1 FROM dart_automation_state WHERE key = $1",
      [STATE_KEY],
    );

    if ((state.rowCount ?? 0) === 0) {
      for (const externalId of ids) {
        await client.query(
          `
            INSERT INTO dart_automation_events (external_id, status, updated_at)
            VALUES ($1, 'baseline', NOW())
            ON CONFLICT (external_id) DO NOTHING
          `,
          [externalId],
        );
      }
      await client.query(
        "INSERT INTO dart_automation_state (key) VALUES ($1) ON CONFLICT (key) DO NOTHING",
        [STATE_KEY],
      );
      await client.query("COMMIT");
      return new Set();
    }

    const claimed = new Set<string>();
    for (const externalId of ids) {
      const result = await client.query(
        `
          INSERT INTO dart_automation_events (
            external_id, status, attempts, claimed_at, updated_at
          ) VALUES ($1, 'processing', 1, NOW(), NOW())
          ON CONFLICT (external_id) DO UPDATE SET
            status = 'processing',
            attempts = dart_automation_events.attempts + 1,
            claimed_at = NOW(),
            last_error = NULL,
            updated_at = NOW()
          WHERE dart_automation_events.attempts < $2
            AND (
              dart_automation_events.status = 'failed'
              OR (
                dart_automation_events.status = 'processing'
                AND dart_automation_events.claimed_at < NOW() - INTERVAL '5 minutes'
              )
            )
          RETURNING external_id
        `,
        [externalId, MAX_ATTEMPTS],
      );
      if ((result.rowCount ?? 0) > 0) {
        claimed.add(externalId);
      }
    }

    await client.query("COMMIT");
    return claimed;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function markDartAutomationDelivered(externalId: string) {
  await ensureDartAutomationStore();
  await getPool().query(
    `
      UPDATE dart_automation_events
      SET status = 'delivered',
          delivered_at = NOW(),
          last_error = NULL,
          updated_at = NOW()
      WHERE external_id = $1
    `,
    [externalId],
  );
}

export async function markDartAutomationFailed(externalId: string, error: string) {
  await ensureDartAutomationStore();
  await getPool().query(
    `
      UPDATE dart_automation_events
      SET status = 'failed',
          last_error = $2,
          updated_at = NOW()
      WHERE external_id = $1
    `,
    [externalId, error.slice(0, 2000)],
  );
}
