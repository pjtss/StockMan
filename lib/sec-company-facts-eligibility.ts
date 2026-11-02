import { getPool } from "@/lib/db";
import { isLikelySecCommonStock, type SecTickerRow } from "@/lib/sec-company-ticker";

export type EligibleSecCommonStock = SecTickerRow & { market: string; universeCode: string; universeName: string };

function canonicalSymbol(value: string) {
  return value.trim().toUpperCase().replace(/[/.]/g, "-");
}

/** Fail-closed check against the enabled KIS common-stock master; no name-only fallback is allowed. */
async function filterUsCommonStocks(rows: SecTickerRow[], requireDailyActive: boolean): Promise<EligibleSecCommonStock[]> {
  const rowsByCik = new Map<string, SecTickerRow[]>();
  for (const row of rows) {
    if (!row.cik) continue;
    const issuerRows = rowsByCik.get(row.cik) || [];
    issuerRows.push(row);
    rowsByCik.set(row.cik, issuerRows);
  }
  const candidates = rows.filter((row) => row.cik && row.ticker && isLikelySecCommonStock(row, rowsByCik.get(row.cik) || [row]));
  if (!candidates.length) return [];
  const tickerKeys = [...new Set(candidates.map((row) => canonicalSymbol(row.ticker)))];
  const dailyActivePredicate = requireDailyActive ? "AND daily_active = TRUE" : "";
  const result = await getPool().query<{ market: string; code: string; name: string }>(
    `SELECT market, code, name
       FROM us_common_stock_universe
      WHERE enabled = TRUE
        ${dailyActivePredicate}
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

/** SEC facts scans are limited to daily-active symbols. */
export function filterActiveSecCommonStocks(rows: SecTickerRow[]): Promise<EligibleSecCommonStock[]> {
  return filterUsCommonStocks(rows, true);
}

/** Company identity coverage includes every enabled common stock, including daily-inactive equities. */
export function filterEnabledSecCommonStocks(rows: SecTickerRow[]): Promise<EligibleSecCommonStock[]> {
  return filterUsCommonStocks(rows, false);
}
