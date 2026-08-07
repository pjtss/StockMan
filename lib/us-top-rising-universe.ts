import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { usInstruments } from "@/lib/schema";
import { ensureUsInstrument } from "@/lib/us-instruments";
import { classifyUsInstrumentProduct, isEligibleUsCommonStock } from "@/lib/us-instrument-product";
import { fetchKisUsTopRisingApi } from "@/lib/kis-us-api";

export const US_EXCHANGES = ["NAS", "AMS", "NYS"] as const;
const EXCLUDED = /ETF|ETN|인버스|레버리지|inverse|leverag|\bshort\b|\b\d+(?:\.\d+)?x\b/i;
function rows(parsed: any) { const output = parsed?.output ?? parsed?.output2 ?? parsed?.output1; return Array.isArray(output) ? output.slice(0, 100) : []; }
function code(row: any) { return String(row.symb ?? row.rsym ?? row.code ?? "").replace(/^D[A-Z]{3}/, "").trim().toUpperCase(); }

export type UsTopRisingScope = { market: string; code: string; name?: string; rank?: number; changeRate?: number | null; rankingVolume?: number | null; rankingTradeValue?: number | null };

/** Canonical persisted universe used by daily indicators. No live ranking API is called. */
export async function loadStoredUsInstrumentScopes() {
  const db = getDb();
  const rows = db ? await db.select({ market: usInstruments.market, code: usInstruments.code, name: usInstruments.name, instrumentType: usInstruments.instrumentType, isEtf: usInstruments.isEtf, isLeveraged: usInstruments.isLeveraged, isInverse: usInstruments.isInverse, isDerivativeProduct: usInstruments.isDerivativeProduct, manualProductAction: usInstruments.manualProductAction })
    .from(usInstruments).where(and(eq(usInstruments.enabled, true), inArray(usInstruments.market, [...US_EXCHANGES])))
    : [];
  const scopes = rows.filter((row) => row.manualProductAction === "ALLOW" || (row.manualProductAction !== "BLOCK" && isEligibleUsCommonStock(row))).map((row, index) => ({ market: row.market, code: row.code, name: row.name, rank: index + 1, changeRate: null, rankingVolume: null, rankingTradeValue: null }));
  return { scopes, universe: { ok: true, source: "DB_INTEGRATED_US_INSTRUMENTS", markets: US_EXCHANGES.map((market) => ({ market, sourceCount: scopes.filter((item) => item.market === market).length })), availableMarketCount: new Set(scopes.map((item) => item.market)).size, criteria: { exchanges: [...US_EXCHANGES], source: "us_instruments" } } };
}

/**
 * Canonical live universe for scanners. Every scanner that used to iterate
 * the integrated instrument table must use this source instead.
 */
export async function loadUsTopRisingScopes() {
  const scopes: UsTopRisingScope[] = []; const seen = new Set<string>(); const markets: Record<string, unknown>[] = [];
  for (const market of US_EXCHANGES) {
    let response = await fetchKisUsTopRisingApi({ excd: market });
    let sourceRows = rows(response?.response?.parsed); let fallbackUsed = false;
    if (sourceRows.length === 0) {
      const fallback = await fetchKisUsTopRisingApi({ excd: market, volRang: "0" });
      const fallbackRows = rows(fallback?.response?.parsed);
      if (fallbackRows.length > 0) { response = fallback; sourceRows = fallbackRows; fallbackUsed = true; }
    }
    let productExcluded = 0;
    for (const [index, item] of sourceRows.entries()) {
      const ticker = code(item); const name = String(item.name ?? item.company ?? item.enName ?? "").trim();
      const excluded = /ETF|ETN|인버스|레버리지|inverse|leverag|\bshort\b|\b\d+(?:\.\d+)?x\b/i.test(`${name} ${String(item.ename ?? "")} ${String(item.etyp_nm ?? "")}`);
      if (!ticker || excluded) { if (excluded) productExcluded += 1; continue; }
      const key = `${market}:${ticker}`; if (seen.has(key)) continue; seen.add(key);
      const numeric = (value: unknown) => { const parsed = Number(String(value ?? "").replace(/,/g, "")); return Number.isFinite(parsed) ? parsed : null; };
      scopes.push({ market, code: ticker, name, rank: index + 1, changeRate: numeric(item.rate ?? item.changeRate ?? item.n_rate), rankingVolume: numeric(item.tvol ?? item.vol ?? item.volume), rankingTradeValue: numeric(item.tamt ?? item.tamnt ?? item.amount) });
    }
    const parsed = response?.response?.parsed as { rt_cd?: unknown; msg_cd?: unknown; msg1?: unknown; output1?: { nrec?: unknown } } | null;
    markets.push({ market, status: response?.status ?? 0, sourceCount: sourceRows.length, selectedCount: scopes.filter((item) => item.market === market).length, productExcluded, fallbackUsed, kis: { rtCd: parsed?.rt_cd ?? null, msgCd: parsed?.msg_cd ?? null, msg1: parsed?.msg1 ?? null, recordCount: parsed?.output1?.nrec ?? sourceRows.length }, rawTextPreview: response?.response?.rawText?.slice(0, 500) ?? "", error: sourceRows.length === 0 ? "KIS returned no TOP100 rows for this exchange; verify market hours and KIS ranking availability" : undefined });
  }
  const availableMarkets = markets.filter((market) => Number(market.sourceCount) > 0).length;
  return { scopes, universe: { ok: availableMarkets === US_EXCHANGES.length, source: "KIS_UPDOWN_RATE_TOP100", markets, availableMarketCount: availableMarkets, criteria: { exchanges: [...US_EXCHANGES], topN: 100, excludeEtfAndLeveraged: true } } };
}

export async function upsertUsTopRisingUniverse() {
  const db = getDb(); const results: any[] = []; const seen = new Set<string>();
  for (const market of US_EXCHANGES) {
    const response = await fetchKisUsTopRisingApi({ excd: market });
    const sourceRows = rows(response?.response?.parsed); let upserted = 0; let excluded = 0;
    for (const row of sourceRows) {
      const ticker = code(row); const name = String(row.name ?? row.company ?? row.enName ?? "").trim();
      if (!ticker) continue;
      const product = classifyUsInstrumentProduct({ name, englishName: row.ename, type: row.etyp_nm });
      const isExcluded = !isEligibleUsCommonStock(product);
      if (isExcluded) { excluded += 1; }
      if (isExcluded) continue;
      if (seen.has(`${market}:${ticker}`)) continue; seen.add(`${market}:${ticker}`);
      if (await ensureUsInstrument({ market, code: ticker, name, englishName: String(row.ename ?? ""), productType: String(row.etyp_nm ?? "") })) upserted += 1;
    }
    results.push({ market, httpStatus: response?.status ?? 0, sourceCount: sourceRows.length, upsertedCount: upserted, excludedCount: excluded, rawTextPreview: response?.response?.rawText?.slice(0, 500) ?? "" });
  }
  const activeCount = db ? (await db.select({ id: usInstruments.id }).from(usInstruments).where(and(eq(usInstruments.enabled, true), inArray(usInstruments.market, [...US_EXCHANGES])))).length : 0;
  return { ok: results.every((row) => row.httpStatus >= 200 && row.httpStatus < 300), checkedAt: new Date().toISOString(), exchanges: [...US_EXCHANGES], results, activeInstrumentCount: activeCount };
}
