import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { krCommonStockUniverse } from "@/lib/schema";
import { isEligibleKrCommonStock } from "@/lib/instrument-eligibility";
import { syncDailyActivityStatus } from "@/lib/daily-activity-status";

export const KR_MARKETS = ["KOSPI", "KOSDAQ"] as const;
export type KrInstrumentScope = { market: string; code: string; name: string };

/** KRX short codes are exactly six numeric digits. Never admit US/alpha tickers. */
function normalizeCode(code: unknown) {
  const value = String(code ?? "").trim().replace(/[-\s]/g, "");
  return /^\d{6}$/.test(value) ? value : "";
}
export function isExcludedKrOfficialName(name: string) {
  return /(?:스팩|SPAC|우선주|우(?:\(|$)|\d우B(?:\(|$)|전환|신주인수권|권리주)/i.test(String(name ?? ""));
}
export async function loadStoredKrInstrumentScopes() {
  await syncDailyActivityStatus();
  const rows = await getDb().select({ market: krCommonStockUniverse.market, code: krCommonStockUniverse.code, name: krCommonStockUniverse.name, instrumentType: krCommonStockUniverse.instrumentType, isEtp: krCommonStockUniverse.isEtp, isWarrant: krCommonStockUniverse.isWarrant, isPreferred: krCommonStockUniverse.isPreferred, tradingHaltCode: krCommonStockUniverse.tradingHaltCode, liquidationCode: krCommonStockUniverse.liquidationCode, managedIssueCode: krCommonStockUniverse.managedIssueCode, isSuspended: krCommonStockUniverse.isSuspended }).from(krCommonStockUniverse).where(and(eq(krCommonStockUniverse.enabled, true), inArray(krCommonStockUniverse.market, [...KR_MARKETS]))).orderBy(asc(krCommonStockUniverse.market), asc(krCommonStockUniverse.code));
  // Eligibility is derived exclusively from the official KIS master fields
  // persisted on the universe row. Do not reinterpret the security type from
  // a display name: names are presentation data and are not authoritative.
  // Cache every official common-stock row. Market-cap, turnover, price,
  // volume and suspension state are detection policies, not cache membership.
  const eligible = rows.filter((row) => isEligibleKrCommonStock(row));
  const excludedByReason = {
    product: rows.filter((row) => row.instrumentType !== "COMMON_STOCK").length,
    suspended: rows.filter((row) => row.instrumentType === "COMMON_STOCK" && (["Y", "1"].includes(String(row.tradingHaltCode ?? "")) || ["Y", "1"].includes(String(row.liquidationCode ?? "")) || ["Y", "1"].includes(String(row.isSuspended ?? "")))).length,
    managed: rows.filter((row) => row.instrumentType === "COMMON_STOCK" && String(row.managedIssueCode ?? "").toUpperCase() === "Y").length,
  };
  return { scopes: eligible.map(({ instrumentType: _instrumentType, isEtp: _isEtp, isWarrant: _isWarrant, isPreferred: _isPreferred, tradingHaltCode: _tradingHaltCode, liquidationCode: _liquidationCode, managedIssueCode: _managedIssueCode, isSuspended: _isSuspended, ...row }) => row), universe: { ok: true, source: "DB_INTEGRATED_KR_INSTRUMENT_UNIVERSE", markets: [...KR_MARKETS], count: eligible.length, excludedInDb: rows.length - eligible.length, excludedByReason, criteria: { instrumentType: "COMMON_STOCK", officialStatus: "tradingHaltCode/liquidationCode/managedIssueCode/isSuspended", numericFilters: "NONE" } } };
}
