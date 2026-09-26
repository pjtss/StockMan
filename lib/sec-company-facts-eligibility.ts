import { getPool } from "@/lib/db";
import { isLikelySecCommonStock, type SecTickerRow } from "@/lib/sec-company-ticker";

export type EligibleSecCommonStock = SecTickerRow & { market: string; universeCode: string; universeName: string };

function canonicalSymbol(value: string) {
  return value.trim().toUpperCase().replace(/[/.]/g, "-");
}

/** Fail-closed check against the active KIS common-stock master; no name-only fallback is allowed. */
export async function filterActiveSecCommonStocks(rows: SecTickerRow[]): Promise<EligibleSecCommonStock[]> {
  const candidates = rows.filter((row) => row.cik && row.ticker && isLikelySecCommonStock(row, rows.filter((candidate) => candidate.cik === row.cik)));
  if (!candidates.length) return [];
  const tickerKeys = [...new Set(candidates.map((row) => canonicalSymbol(row.ticker)))];
  const result = await getPool().query<{ market: string; code: string; name: string }>(
    `SELECT market, code, name
       FROM us_common_stock_universe
      WHERE enabled = TRUE
        AND daily_active = TRUE
        AND instrument_type = 'COMMON_STOCK'
        AND COALESCE(is_etf, FALSE) = FALSE
        AND COALESCE(is_warrant, FALSE) = FALSE
        AND COALESCE(is_derivative, FALSE) = FALSE
        AND COALESCE(is_dr, FALSE) = FALSE
        AND COALESCE(is_leveraged, FALSE) = FALSE
        AND COALESCE(is_inverse, FALSE) = FALSE
        AND UPPER(REPLACE(REPLACE(code, '/', '-'), '.', '-')) = ANY($1::text[])`,
    [tickerKeys],
  );
  const eligibleKeys = new Set(result.rows.map((row) => canonicalSymbol(row.code)));
  return candidates.filter((row) => eligibleKeys.has(canonicalSymbol(row.ticker))).map((row) => {
    const universe = result.rows.find((candidate) => canonicalSymbol(candidate.code) === canonicalSymbol(row.ticker))!;
    return { ...row, market: universe.market, universeCode: universe.code, universeName: universe.name };
  });
}
