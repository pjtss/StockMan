import { getPool } from "@/lib/db";

export async function loadUsProductClassifications() {
  const pool = getPool();
  if (!pool) return [];
  const result = await pool.query(`SELECT market, code, name, instrument_type, is_etf, is_leveraged, is_inverse, is_derivative_product, product_status, enabled, classification_source, classification_confidence, classification_checked_at, classification_reason, manual_product_action FROM us_instruments WHERE market IN ('NAS','NYS','AMS') ORDER BY market, code`);
  return result.rows;
}

export async function setUsProductOverride(input: { market: string; code: string; action: "BLOCK" | null }) {
  const pool = getPool();
  if (!pool) throw new Error("database unavailable");
  const result = await pool.query(`UPDATE us_instruments SET manual_product_action = $3, updated_at = NOW() WHERE market = $1 AND code = $2 RETURNING market, code, manual_product_action`, [input.market.toUpperCase(), input.code.toUpperCase(), input.action]);
  if (!result.rowCount) throw new Error("instrument not found");
  return result.rows[0];
}
