import { getPool } from "./db";

export type AutomationLockLease = { release: () => Promise<void> };

/** Acquire a session advisory lock that can be held across a response boundary. */
export async function acquireAutomationLock(key: string): Promise<AutomationLockLease | null> {
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
    let released = false;
    return {
      release: async () => {
        if (released) return;
        released = true;
        let destroy = false;
        try {
          const unlock = await client.query<{ unlocked: boolean }>("SELECT pg_advisory_unlock(hashtext($1)) AS unlocked", [key]);
          if (unlock.rows[0]?.unlocked !== true) {
            destroy = true;
            console.error(`[AutomationLock] unlock was not confirmed for ${key}; destroying pooled client`);
          }
        } catch (error) {
          destroy = true;
          console.error(`[AutomationLock] unlock failed for ${key}; destroying pooled client:`, error instanceof Error ? error.message : error);
        } finally {
          client.release(destroy);
        }
      },
    };
  } finally {
    if (acquisitionAttempted && !acquisitionResultKnown) destroyClient = true;
    if (!lockAcquired || !acquisitionResultKnown) client.release(destroyClient);
  }
}

export async function withAutomationLock<T>(key: string, task: () => Promise<T>): Promise<T | null> {
  const lease = await acquireAutomationLock(key);
  if (lease === null) return null;
  try {
    return await task();
  } finally {
    await lease.release();
  }
}
