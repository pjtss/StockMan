import { getPool } from "./db";

const MAX_ATTEMPTS = 3;
let schemaPromise: Promise<void> | null = null;

async function ensureSecAutomationStore() {
  if (!schemaPromise) {
    schemaPromise = getPool()
      .query(`
        CREATE TABLE IF NOT EXISTS sec_automation_events (
          external_id TEXT PRIMARY KEY,
          status TEXT NOT NULL,
          attempts INTEGER NOT NULL DEFAULT 0,
          claimed_at TIMESTAMPTZ,
          delivered_at TIMESTAMPTZ,
          last_error TEXT,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `)
      .then(() => undefined)
      .catch((error) => {
        schemaPromise = null;
        throw error;
      });
  }

  await schemaPromise;
}

export async function claimSecAutomation(externalId: string): Promise<boolean> {
  await ensureSecAutomationStore();
  const result = await getPool().query(
    `
      INSERT INTO sec_automation_events (
        external_id, status, attempts, claimed_at, updated_at
      ) VALUES ($1, 'processing', 1, NOW(), NOW())
      ON CONFLICT (external_id) DO UPDATE SET
        status = 'processing',
        attempts = sec_automation_events.attempts + 1,
        claimed_at = NOW(),
        last_error = NULL,
        updated_at = NOW()
      WHERE sec_automation_events.attempts < $2
        AND (
          sec_automation_events.status = 'failed'
          OR (
            sec_automation_events.status = 'processing'
            AND sec_automation_events.claimed_at < NOW() - INTERVAL '5 minutes'
          )
        )
      RETURNING external_id
    `,
    [externalId, MAX_ATTEMPTS],
  );

  return (result.rowCount ?? 0) > 0;
}

export async function markSecAutomationDelivered(externalId: string): Promise<void> {
  await ensureSecAutomationStore();
  await getPool().query(
    `
      UPDATE sec_automation_events
      SET status = 'delivered',
          delivered_at = NOW(),
          last_error = NULL,
          updated_at = NOW()
      WHERE external_id = $1
    `,
    [externalId],
  );
}

export async function markSecAutomationFailed(externalId: string, error: string): Promise<void> {
  await ensureSecAutomationStore();
  await getPool().query(
    `
      UPDATE sec_automation_events
      SET status = 'failed',
          last_error = $2,
          updated_at = NOW()
      WHERE external_id = $1
    `,
    [externalId, error.slice(0, 2000)],
  );
}
