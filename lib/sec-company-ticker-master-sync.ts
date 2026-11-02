import { sql } from "drizzle-orm";
import { getDb } from "./db";
import { secCompanies } from "./schema";
import type { EligibleSecCommonStock } from "./sec-company-facts-eligibility";
import type { SecTickerRow } from "./sec-company-ticker";

export type SecCompanyTickerMasterRecord = {
  cik: string;
  name: string;
  tickers: string[];
  exchanges: string[];
};

export type SecCompanyTickerMasterWriter = (records: SecCompanyTickerMasterRecord[], syncedAt: Date) => Promise<void>;

/** Keep only issuers confirmed by the active common-stock master, but retain all their SEC-listed share classes. */
export function buildSecCompanyTickerMasterRecords(allRows: SecTickerRow[], activeCommonRows: EligibleSecCommonStock[]) {
  const activeCiks = new Set(activeCommonRows.map((row) => row.cik).filter((cik) => /^\d{10}$/.test(cik)));
  const grouped = new Map<string, { name: string; tickers: Set<string>; exchanges: Set<string> }>();

  for (const row of allRows) {
    if (!activeCiks.has(row.cik) || !/^\d{10}$/.test(row.cik) || !row.ticker.trim() || !row.name.trim()) continue;
    const entry = grouped.get(row.cik) || { name: row.name.trim(), tickers: new Set<string>(), exchanges: new Set<string>() };
    entry.tickers.add(row.ticker.trim().toUpperCase());
    if (row.exchange.trim()) entry.exchanges.add(row.exchange.trim());
    grouped.set(row.cik, entry);
  }

  return [...grouped.entries()].map(([cik, entry]) => ({
    cik,
    name: entry.name,
    tickers: [...entry.tickers].sort(),
    exchanges: [...entry.exchanges].sort(),
  })).sort((left, right) => left.cik.localeCompare(right.cik));
}

async function upsertSecCompanyTickerMaster(records: SecCompanyTickerMasterRecord[], syncedAt: Date) {
  if (!records.length) return;
  const db = getDb();
  const chunkSize = 500;
  for (let offset = 0; offset < records.length; offset += chunkSize) {
    const values = records.slice(offset, offset + chunkSize).map((record) => ({
      ...record,
      sic: null,
      sourceUpdatedAt: syncedAt,
      updatedAt: syncedAt,
    }));
    await db.insert(secCompanies).values(values).onConflictDoUpdate({
      target: secCompanies.cik,
      set: {
        name: sql`excluded.name`,
        tickers: sql`excluded.tickers`,
        exchanges: sql`excluded.exchanges`,
        sourceUpdatedAt: syncedAt,
        updatedAt: syncedAt,
      },
    });
  }
}

export async function syncSecCompanyTickerMaster(
  allRows: SecTickerRow[],
  activeCommonRows: EligibleSecCommonStock[],
  writer: SecCompanyTickerMasterWriter = upsertSecCompanyTickerMaster,
) {
  const records = buildSecCompanyTickerMasterRecords(allRows, activeCommonRows);
  const syncedAt = new Date();
  await writer(records, syncedAt);
  return { issuerCount: records.length, tickerCount: records.reduce((count, row) => count + row.tickers.length, 0), syncedAt: syncedAt.toISOString() };
}
