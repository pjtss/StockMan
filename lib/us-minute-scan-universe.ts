import { getPool } from "@/lib/db";
import type { UsTopRisingScope } from "@/lib/us-top-rising-universe";

export async function syncUsMinuteScanUniverse(scopes: UsTopRisingScope[], topN: number) {
  const pool = getPool();
  const selected = scopes.filter((scope) => Number(scope.rank ?? 0) > 0 && Number(scope.rank ?? 0) <= topN);
  const markets = [...new Set(selected.map((scope) => scope.market))];
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (markets.length) await client.query(`DELETE FROM us_minute_scan_universe WHERE market = ANY($1::text[])`, [markets]);
    if (selected.length) {
      const values: unknown[] = [];
      const placeholders = selected.map((scope, index) => {
        const offset = index * 5;
        values.push(scope.market, scope.code, scope.name ?? null, scope.rank, scope.changeRate ?? null);
        return `($${offset + 1},$${offset + 2},$${offset + 3},$${offset + 4},$${offset + 5},NOW())`;
      }).join(",");
      await client.query(`INSERT INTO us_minute_scan_universe (market, code, name, rank, change_rate, updated_at) VALUES ${placeholders} ON CONFLICT (market, code) DO UPDATE SET name=EXCLUDED.name, rank=EXCLUDED.rank, change_rate=EXCLUDED.change_rate, updated_at=NOW()`, values);
    }
    await client.query("COMMIT");
    return { persisted: selected.length, markets };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}
