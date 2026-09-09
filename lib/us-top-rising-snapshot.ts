import { getPool } from "@/lib/db";
import type { UsTopRisingScope } from "@/lib/us-top-rising-universe";

export async function saveUsTopRisingSnapshot(input: { ok: boolean; markets: unknown; scopes: UsTopRisingScope[]; requestedTopN?: number }) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const snapshot = await client.query<{ id: string }>("INSERT INTO us_top_rising_snapshots (ok, requested_top_n, markets) VALUES ($1,$2,$3::jsonb) RETURNING id", [input.ok, input.requestedTopN ?? 100, JSON.stringify(input.markets)]);
    const id = snapshot.rows[0]?.id;
    if (!id) throw new Error("snapshot id was not returned");
    if (input.scopes.length) {
      const values: unknown[] = [];
      const placeholders = input.scopes.map((item, index) => {
        const offset = index * 6;
        values.push(id, item.market, item.code, item.name ?? null, item.rank ?? 0, item.changeRate ?? null);
        return `($${offset + 1},$${offset + 2},$${offset + 3},$${offset + 4},$${offset + 5},$${offset + 6})`;
      }).join(",");
      await client.query(`INSERT INTO us_top_rising_snapshot_items (snapshot_id,market,code,name,rank,change_rate) VALUES ${placeholders}`, values);
    }
    await client.query("COMMIT");
    return id;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}
