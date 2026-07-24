import { getPool } from "./db";

export async function withAutomationLock<T>(key: string, task: () => Promise<T>): Promise<T | null> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    const lock = await client.query<{ locked: boolean }>("SELECT pg_try_advisory_lock(hashtext($1)) AS locked", [key]);
    if (!lock.rows[0]?.locked) return null;
    try { return await task(); } finally { await client.query("SELECT pg_advisory_unlock(hashtext($1))", [key]); }
  } finally { client.release(); }
}
