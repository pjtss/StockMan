import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { krInstrumentUniverse } from "@/lib/schema";

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
  const rows = await getDb().select({ market: krInstrumentUniverse.market, code: krInstrumentUniverse.code, name: krInstrumentUniverse.name, instrumentType: krInstrumentUniverse.instrumentType, isEtp: krInstrumentUniverse.isEtp, isWarrant: krInstrumentUniverse.isWarrant, isPreferred: krInstrumentUniverse.isPreferred, tradingHaltCode: krInstrumentUniverse.tradingHaltCode, liquidationCode: krInstrumentUniverse.liquidationCode }).from(krInstrumentUniverse).where(and(eq(krInstrumentUniverse.enabled, true), inArray(krInstrumentUniverse.market, [...KR_MARKETS]))).orderBy(asc(krInstrumentUniverse.market), asc(krInstrumentUniverse.code));
  // Eligibility is derived exclusively from the official KIS master fields
  // persisted on the universe row. Do not reinterpret the security type from
  // a display name: names are presentation data and are not authoritative.
  // Cache every official common-stock row. Market-cap, turnover, price,
  // volume and suspension state are detection policies, not cache membership.
  const eligible = rows.filter((row) => row.instrumentType === "COMMON_STOCK" && !isExcludedKrOfficialName(row.name) && !["Y", "1"].includes(String(row.tradingHaltCode ?? "")) && !["Y", "1"].includes(String(row.liquidationCode ?? "")));
  const excludedByReason = {
    product: rows.filter((row) => row.instrumentType !== "COMMON_STOCK" || isExcludedKrOfficialName(row.name)).length,
    suspended: rows.filter((row) => row.instrumentType === "COMMON_STOCK" && !isExcludedKrOfficialName(row.name) && (["Y", "1"].includes(String(row.tradingHaltCode ?? "")) || ["Y", "1"].includes(String(row.liquidationCode ?? "")))).length,
  };
  return { scopes: eligible.map(({ instrumentType: _instrumentType, isEtp: _isEtp, isWarrant: _isWarrant, isPreferred: _isPreferred, tradingHaltCode: _tradingHaltCode, liquidationCode: _liquidationCode, ...row }) => row), universe: { ok: true, source: "DB_INTEGRATED_KR_INSTRUMENT_UNIVERSE", markets: [...KR_MARKETS], count: eligible.length, excludedInDb: rows.length - eligible.length, excludedByReason, criteria: { instrumentType: "COMMON_STOCK", officialStatus: "tradingHaltCode/liquidationCode only", numericFilters: "NONE" } } };
}
