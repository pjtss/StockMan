import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { krInstrumentUniverse } from "@/lib/schema";
import { classifyKrInstrumentProduct, isEligibleKrCommonStock } from "@/lib/kr-instrument-product";

export const KR_MARKET = "KRX";
export type KrInstrumentScope = { market: string; code: string; name: string };

/** KRX short codes are exactly six numeric digits. Never admit US/alpha tickers. */
function normalizeCode(code: unknown) {
  const value = String(code ?? "").trim().replace(/[-\s]/g, "");
  return /^\d{6}$/.test(value) ? value : "";
}
export async function loadStoredKrInstrumentScopes() {
  const rows = await getDb().select({ market: krInstrumentUniverse.market, code: krInstrumentUniverse.code, name: krInstrumentUniverse.name, instrumentType: krInstrumentUniverse.instrumentType, isEtp: krInstrumentUniverse.isEtp, isWarrant: krInstrumentUniverse.isWarrant, isPreferred: krInstrumentUniverse.isPreferred, isSuspended: krInstrumentUniverse.isSuspended }).from(krInstrumentUniverse).where(and(eq(krInstrumentUniverse.enabled, true), eq(krInstrumentUniverse.market, KR_MARKET))).orderBy(asc(krInstrumentUniverse.code));
  const eligible = rows.filter((row) => !row.isEtp && !row.isWarrant && !row.isSuspended && (row.instrumentType === "COMMON_STOCK" || row.instrumentType === "DR") && isEligibleKrCommonStock(classifyKrInstrumentProduct({ name: row.name })));
  return { scopes: eligible.map(({ instrumentType: _instrumentType, isEtp: _isEtp, isWarrant: _isWarrant, isPreferred: _isPreferred, isSuspended: _isSuspended, ...row }) => row), universe: { ok: true, source: "DB_INTEGRATED_KR_INSTRUMENT_UNIVERSE", count: eligible.length, excludedInDb: rows.length - eligible.length } };
}
