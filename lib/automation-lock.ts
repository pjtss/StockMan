import { getPool } from "./db";

export async function withAutomationLock<T>(key: string, task: () => Promise<T>): Promise<T | null> {
  const pool = getPool();
  const client = await pool.connect();
  let acquisitionAttempted = false;
  let acquisitionResultKnown = false;
  let lockAcquired = false;
  let destroyClient = false;
  try {
    acquisitionAttempted = true;
    let lock: { rows: Array<{ locked: boolean }> };
    try {
      lock = await client.query<{ locked: boolean }>("SELECT pg_try_advisory_lock(hashtext($1)) AS locked", [key]);
      acquisitionResultKnown = true;
    } catch (error) {
      // The server may have acquired the session lock before the response was
      // lost. Never return a connection with an uncertain lock state to pool.
      destroyClient = true;
      throw error;
    }
    const acquired = lock.rows[0]?.locked;
    if (typeof acquired !== "boolean") {
      destroyClient = true;
      throw new Error("AUTOMATION_LOCK_ACQUIRE_RESULT_UNAVAILABLE");
    }
    lockAcquired = acquired;
    if (!lockAcquired) return null;
    return await task();
  } finally {
    if (acquisitionAttempted && !acquisitionResultKnown) destroyClient = true;
    if (lockAcquired) {
      try {
        const unlock = await client.query<{ unlocked: boolean }>("SELECT pg_advisory_unlock(hashtext($1)) AS unlocked", [key]);
        if (unlock.rows[0]?.unlocked !== true) {
          destroyClient = true;
          console.error(`[AutomationLock] unlock was not confirmed for ${key}; destroying pooled client`);
        }
      } catch (error) {
        destroyClient = true;
        console.error(`[AutomationLock] unlock failed for ${key}; destroying pooled client:`, error instanceof Error ? error.message : error);
      }
    }
    client.release(destroyClient);
  }
}
