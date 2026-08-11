import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { krInstruments } from "@/lib/schema";
import { fetchDomesticFluctuation, fetchDomesticVolumePower } from "@/lib/kis-domestic-api";
import { getAccessToken } from "@/lib/kis";
import { classifyKrInstrumentProduct, isEligibleKrCommonStock } from "@/lib/kr-instrument-product";

export const KR_MARKET = "KRX";
export type KrInstrumentScope = { market: string; code: string; name: string };

/** KRX short codes are exactly six numeric digits. Never admit US/alpha tickers. */
function normalizeCode(code: unknown) {
  const value = String(code ?? "").trim().replace(/[-\s]/g, "");
  return /^\d{6}$/.test(value) ? value : "";
}
export async function ensureKrInstrument(input: { code: string; name?: string; productType?: string; market?: string; source?: string }) {
  const code = normalizeCode(input.code); if (!code) throw new Error("KR_CODE_REQUIRED");
  const product = classifyKrInstrumentProduct({ name: input.name, productType: input.productType });
  if (!isEligibleKrCommonStock(product)) return { market: (input.market ?? KR_MARKET).toUpperCase(), code, saved: false, excluded: true, reason: product.reason };
  const db = getDb();
  await db.insert(krInstruments).values({ market: (input.market ?? KR_MARKET).toUpperCase(), code, name: input.name ?? "", source: input.source ?? "KIS", productStatus: "ACTIVE", classificationReason: product.reason, updatedAt: new Date() }).onConflictDoUpdate({ target: [krInstruments.market, krInstruments.code], set: { name: input.name ?? "", source: input.source ?? "KIS", productStatus: "ACTIVE", classificationReason: product.reason, enabled: true, updatedAt: new Date() } });
  return { market: (input.market ?? KR_MARKET).toUpperCase(), code, saved: true, excluded: false };
}
export async function loadStoredKrInstrumentScopes() {
  const rows = await getDb().select({ market: krInstruments.market, code: krInstruments.code, name: krInstruments.name, productStatus: krInstruments.productStatus }).from(krInstruments).where(and(eq(krInstruments.enabled, true), eq(krInstruments.productStatus, "ACTIVE"))).orderBy(asc(krInstruments.code));
  const eligible = rows.filter((row) => isEligibleKrCommonStock(classifyKrInstrumentProduct({ name: row.name })));
  return { scopes: eligible.map(({ productStatus: _productStatus, ...row }) => row), universe: { ok: true, source: "DB_INTEGRATED_KR_INSTRUMENTS", count: eligible.length, excludedInDb: rows.length - eligible.length } };
}
export async function syncKrInstrumentUniverseFromKis() {
  const token = await getAccessToken(); if (!token) throw new Error("KIS_TOKEN_UNAVAILABLE");
  const sources = await Promise.allSettled([fetchDomesticFluctuation(token), fetchDomesticVolumePower(token)]);
  const details = sources.map((item, index) => ({ source: index === 0 ? "FLUCTUATION" : "VOLUME_POWER", ok: item.status === "fulfilled", count: item.status === "fulfilled" ? item.value.length : 0, error: item.status === "rejected" ? String(item.reason) : undefined }));
  let saved = 0;
  let excluded = 0;
  for (const source of sources) if (source.status === "fulfilled") for (const row of source.value as any[]) {
    const code = normalizeCode(row.mksc_shrn_iscd ?? row.stck_shrn_iscd ?? row.code); if (!code || code === "000000") continue;
    const result = await ensureKrInstrument({ code, name: String(row.hts_kor_shr_nlen ?? row.hts_kor_isnm ?? row.name ?? ""), productType: String(row.etyp_nm ?? row.product_type ?? ""), source: "KIS_RANKING" });
    if (result.excluded) excluded += 1; else if (result.saved) saved += 1;
  }
  // Reclassify existing rows as well. This prevents legacy ETF/bond/index
  // rows from remaining active merely because they were inserted before the
  // product classifier existed.
  const existing = await getDb().select({ id: krInstruments.id, name: krInstruments.name }).from(krInstruments).where(eq(krInstruments.enabled, true));
  for (const row of existing) {
    const product = classifyKrInstrumentProduct({ name: row.name });
    if (!isEligibleKrCommonStock(product)) {
      await getDb().update(krInstruments).set({ enabled: false, productStatus: "INACTIVE_EXCLUDED", classificationReason: product.reason, updatedAt: new Date() }).where(eq(krInstruments.id, row.id));
    }
  }
  return { ok: details.some((item) => item.ok), source: "KIS_DOMESTIC_RANKING", details, savedCount: saved, excludedCount: excluded, universe: await loadStoredKrInstrumentScopes() };
}
