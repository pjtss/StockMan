import { eq } from "drizzle-orm";
import { getDb, getPool } from "./db";
import { kisCache } from "./schema";

export async function readKisCache<T>(key: string): Promise<T | null> {
  const db = getDb();
  if (!db) return null;
  const rows = await db.select({ data: kisCache.data }).from(kisCache).where(eq(kisCache.key, key)).limit(1);
  return rows.length > 0 ? rows[0].data as T : null;
}

export async function getKisCacheSourceTimestamp(): Promise<string> {
  const result = await getPool().query<{ source_checked_at: string }>(`SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS source_checked_at`);
  const sourceCheckedAt = result.rows[0]?.source_checked_at;
  if (typeof sourceCheckedAt !== "string" || !Number.isFinite(Date.parse(sourceCheckedAt))) throw new Error("KIS_CACHE_SOURCE_TIMESTAMP_UNAVAILABLE");
  return sourceCheckedAt;
}

export async function writeKisCache<T>(key: string, data: T): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db.insert(kisCache).values({ key, data, updatedAt: new Date() }).onConflictDoUpdate({
    target: kisCache.key,
    set: { data, updatedAt: new Date() },
  });
}

/** Atomically preserve the newest source generation for cache payloads that
 * carry an ISO sourceCheckedAt timestamp. */
export async function writeKisCacheIfSourceIsNewer<T>(key: string, data: T, sourceCheckedAt: string): Promise<boolean> {
  if (!Number.isFinite(Date.parse(sourceCheckedAt))) throw new Error("KIS_CACHE_SOURCE_TIMESTAMP_INVALID");
  const updatedAtSql = `to_jsonb(to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))`;
  const result = await getPool().query(
    `INSERT INTO kis_cache (key, data, updated_at)
     VALUES ($1, jsonb_set($2::jsonb, '{updatedAt}', ${updatedAtSql}), NOW())
     ON CONFLICT (key) DO UPDATE
       SET data = jsonb_set(EXCLUDED.data, '{updatedAt}', ${updatedAtSql}), updated_at = NOW()
       WHERE COALESCE(NULLIF(kis_cache.data->>'sourceCheckedAt', '')::timestamptz, '-infinity'::timestamptz) < $3::timestamptz
     RETURNING key`,
    [key, JSON.stringify(data), sourceCheckedAt],
  );
  return Number(result.rowCount ?? 0) > 0;
}
