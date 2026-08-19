import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { krInstrumentUniverse } from "@/lib/schema";

export const KR_MARKET = "KRX";
export type KrInstrumentScope = { market: string; code: string; name: string };

/** KRX short codes are exactly six numeric digits. Never admit US/alpha tickers. */
function normalizeCode(code: unknown) {
  const value = String(code ?? "").trim().replace(/[-\s]/g, "");
  return /^\d{6}$/.test(value) ? value : "";
}
export async function loadStoredKrInstrumentScopes() {
  const rows = await getDb().select({ market: krInstrumentUniverse.market, code: krInstrumentUniverse.code, name: krInstrumentUniverse.name, instrumentType: krInstrumentUniverse.instrumentType, isEtp: krInstrumentUniverse.isEtp, isWarrant: krInstrumentUniverse.isWarrant, isPreferred: krInstrumentUniverse.isPreferred, isSuspended: krInstrumentUniverse.isSuspended }).from(krInstrumentUniverse).where(and(eq(krInstrumentUniverse.enabled, true), eq(krInstrumentUniverse.market, KR_MARKET))).orderBy(asc(krInstrumentUniverse.code));
  // Eligibility is derived exclusively from the official KIS master fields
  // persisted on the universe row. Do not reinterpret the security type from
  // a display name: names are presentation data and are not authoritative.
  // Cache every official common-stock row. Market-cap, turnover, price,
  // volume and suspension state are detection policies, not cache membership.
  const eligible = rows.filter((row) => row.instrumentType === "COMMON_STOCK");
  return { scopes: eligible.map(({ instrumentType: _instrumentType, isEtp: _isEtp, isWarrant: _isWarrant, isPreferred: _isPreferred, isSuspended: _isSuspended, ...row }) => row), universe: { ok: true, source: "DB_INTEGRATED_KR_INSTRUMENT_UNIVERSE", count: eligible.length, excludedInDb: rows.length - eligible.length, criteria: { instrumentType: "COMMON_STOCK", numericFilters: "NONE" } } };
}
