import { asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { krInstruments } from "@/lib/schema";
import { fetchDomesticFluctuation, fetchDomesticVolumePower } from "@/lib/kis-domestic-api";
import { getAccessToken } from "@/lib/kis";

export const KR_MARKET = "KRX";
export type KrInstrumentScope = { market: string; code: string; name: string };

function normalizeCode(code: unknown) { return String(code ?? "").trim().replace(/[^0-9A-Za-z]/g, "").padStart(6, "0").slice(-6); }
export async function ensureKrInstrument(input: { code: string; name?: string; market?: string; source?: string }) {
  const code = normalizeCode(input.code); if (!code) throw new Error("KR_CODE_REQUIRED");
  const db = getDb();
  await db.insert(krInstruments).values({ market: (input.market ?? KR_MARKET).toUpperCase(), code, name: input.name ?? "", source: input.source ?? "KIS", updatedAt: new Date() }).onConflictDoUpdate({ target: [krInstruments.market, krInstruments.code], set: { name: input.name ?? "", source: input.source ?? "KIS", enabled: true, updatedAt: new Date() } });
  return { market: (input.market ?? KR_MARKET).toUpperCase(), code };
}
export async function loadStoredKrInstrumentScopes() {
  const rows = await getDb().select({ market: krInstruments.market, code: krInstruments.code, name: krInstruments.name }).from(krInstruments).where(eq(krInstruments.enabled, true)).orderBy(asc(krInstruments.code));
  return { scopes: rows, universe: { ok: true, source: "DB_INTEGRATED_KR_INSTRUMENTS", count: rows.length } };
}
export async function syncKrInstrumentUniverseFromKis() {
  const token = await getAccessToken(); if (!token) throw new Error("KIS_TOKEN_UNAVAILABLE");
  const sources = await Promise.allSettled([fetchDomesticFluctuation(token), fetchDomesticVolumePower(token)]);
  const details = sources.map((item, index) => ({ source: index === 0 ? "FLUCTUATION" : "VOLUME_POWER", ok: item.status === "fulfilled", count: item.status === "fulfilled" ? item.value.length : 0, error: item.status === "rejected" ? String(item.reason) : undefined }));
  let saved = 0;
  for (const source of sources) if (source.status === "fulfilled") for (const row of source.value as any[]) {
    const code = normalizeCode(row.mksc_shrn_iscd ?? row.stck_shrn_iscd ?? row.code); if (!code || code === "000000") continue;
    await ensureKrInstrument({ code, name: String(row.hts_kor_shr_nlen ?? row.hts_kor_isnm ?? row.name ?? ""), source: "KIS_RANKING" }); saved += 1;
  }
  return { ok: details.some((item) => item.ok), source: "KIS_DOMESTIC_RANKING", details, savedCount: saved, universe: await loadStoredKrInstrumentScopes() };
}
