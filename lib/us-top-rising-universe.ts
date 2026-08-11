import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { usInstruments } from "@/lib/schema";
import { ensureUsInstrument } from "@/lib/us-instruments";
import { classifyUsInstrumentProduct, isEligibleUsCommonStock } from "@/lib/us-instrument-product";
import { fetchKisUsTopRisingApi } from "@/lib/kis-us-api";
import { getPool } from "@/lib/db";
import { loadUsTurnoverFilterSettings, type UsTurnoverFilterSettings } from "@/lib/us-turnover-settings";

export const US_EXCHANGES = ["NAS", "AMS", "NYS"] as const;
const EXCLUDED = /ETF|ETN|인버스|레버리지|inverse|leverag|\bshort\b|\b\d+(?:\.\d+)?x\b/i;
// KIS occasionally omits etyp_nm for exchange-traded products. These issuer
// and product-name hints prevent the live VWAP universe from treating an ETF
// as a common stock when provider metadata is incomplete.
const ETF_NAME_HINT = /\b(?:ISHARES|VISTASHARES|ROUNDHILL|KRANESHARES|KFA|SPDR|VANECK|PROSHARES|DIREXION|GLOBAL\s+X|INVESCO|GRANITESHARES|AMPLIFY|JANUS\s+HENDERSON)\b/i;
function rows(parsed: any) { const output = parsed?.output ?? parsed?.output2 ?? parsed?.output1; return Array.isArray(output) ? output.slice(0, 100) : []; }
function code(row: any) { return String(row.symb ?? row.rsym ?? row.code ?? "").replace(/^D[A-Z]{3}/, "").trim().toUpperCase(); }

export type UsTopRisingScope = { market: string; code: string; name?: string; rank?: number; changeRate?: number | null; rankingVolume?: number | null; rankingTradeValue?: number | null; marketCap?: number | null };

export async function applyCommonMarketCapFilter<T extends UsTopRisingScope>(scopes: T[], settings: UsTurnoverFilterSettings = DEFAULT_SETTINGS): Promise<T[]> {
  const enabled = settings.globalMinMarketCap > 0 || settings.globalMaxMarketCap > 0;
  if (!enabled || scopes.length === 0) return scopes;
  const caps = new Map<string, number | null>();
  try {
    const result = await getPool().query<{ market: string; code: string; market_cap: number | null }>("SELECT DISTINCT ON (market, code) market, code, market_cap FROM us_turnover_ratio_snapshots WHERE market = ANY($1::text[]) ORDER BY market, code, observed_at DESC", [[...US_EXCHANGES]]);
    for (const row of result.rows) caps.set(`${row.market}:${row.code}`, row.market_cap == null ? null : Number(row.market_cap));
  } catch { return []; }
  return scopes.filter((scope) => {
    const marketCap = scope.marketCap ?? caps.get(`${scope.market}:${scope.code}`) ?? null;
    return marketCap != null && marketCap >= settings.globalMinMarketCap && (settings.globalMaxMarketCap <= 0 || marketCap <= settings.globalMaxMarketCap);
  }).map((scope) => ({ ...scope, marketCap: scope.marketCap ?? caps.get(`${scope.market}:${scope.code}`) ?? null }));
}

const DEFAULT_SETTINGS: UsTurnoverFilterSettings = { maxPrice: 0, maxRate: 0, maxOpenToHighRate: 0, minMarketCap: 0, maxMarketCap: 0, globalMinMarketCap: 0, globalMaxMarketCap: 0, minTurnoverRatio: 0, maxTurnoverRatio: 0, tradingValueIncreaseAlert: 0, minIntensity: 0, minTradingValueRvol: 0, minTradingValueIncreaseRate: 0, minPersistenceWindows: 0 };
const STORED_SCOPE_CACHE_TTL_MS = 10_000;
export type StoredUsInstrumentScopes = {
  scopes: UsTopRisingScope[];
  universe: {
    ok: boolean;
    source: string;
    markets: Array<{ market: string; sourceCount: number }>;
    availableMarketCount: number;
    criteria: Record<string, unknown>;
  };
};
let storedScopeCache: { expiresAt: number; value: StoredUsInstrumentScopes } | null = null;
let storedScopeInflight: Promise<StoredUsInstrumentScopes> | null = null;

/** Canonical persisted universe used by daily indicators. No live ranking API is called. */
export async function loadStoredUsInstrumentScopes(): Promise<StoredUsInstrumentScopes> {
  if (storedScopeCache && storedScopeCache.expiresAt > Date.now()) return storedScopeCache.value;
  if (storedScopeInflight) return storedScopeInflight;
  storedScopeInflight = (async () => {
    const db = getDb();
    const rows = db ? await db.select({ market: usInstruments.market, code: usInstruments.code, name: usInstruments.name, instrumentType: usInstruments.instrumentType, isEtf: usInstruments.isEtf, isLeveraged: usInstruments.isLeveraged, isInverse: usInstruments.isInverse, isDerivativeProduct: usInstruments.isDerivativeProduct, manualProductAction: usInstruments.manualProductAction, productStatus: usInstruments.productStatus })
      .from(usInstruments).where(and(eq(usInstruments.enabled, true), inArray(usInstruments.market, [...US_EXCHANGES])))
      : [];
    const settings = await loadUsTurnoverFilterSettings();
    const eligibleRows = rows.filter((row) => row.manualProductAction !== "BLOCK" && row.productStatus === "ACTIVE" && isEligibleUsCommonStock(row) && isEligibleUsCommonStock(classifyUsInstrumentProduct({ name: row.name, type: row.instrumentType })));
    const scopes = await applyCommonMarketCapFilter(eligibleRows.map((row, index) => ({ market: row.market, code: row.code, name: row.name, rank: index + 1, changeRate: null, rankingVolume: null, rankingTradeValue: null })), settings);
    const commonFilterEnabled = settings.globalMinMarketCap > 0 || settings.globalMaxMarketCap > 0;
    return { scopes, universe: { ok: true, source: "DB_INTEGRATED_US_INSTRUMENTS", markets: US_EXCHANGES.map((market) => ({ market, sourceCount: scopes.filter((item) => item.market === market).length })), availableMarketCount: new Set(scopes.map((item) => item.market)).size, criteria: { exchanges: [...US_EXCHANGES], source: "us_instruments", commonFilter: { enabled: commonFilterEnabled, minMarketCap: settings.globalMinMarketCap, maxMarketCap: settings.globalMaxMarketCap, unknownMarketCap: commonFilterEnabled ? "excluded" : "allowed" } } } };
  })();
  try {
    const value = await storedScopeInflight;
    storedScopeCache = { value, expiresAt: Date.now() + STORED_SCOPE_CACHE_TTL_MS };
    return value;
  } finally {
    storedScopeInflight = null;
  }
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
      const product = classifyUsInstrumentProduct({ name, englishName: item.ename, type: item.etyp_nm, market });
      const productText = `${name} ${String(item.ename ?? "")} ${String(item.etyp_nm ?? "")}`;
      const excluded = !isEligibleUsCommonStock(product) || EXCLUDED.test(productText) || ETF_NAME_HINT.test(productText);
      if (!ticker || excluded) { if (excluded) productExcluded += 1; continue; }
      const key = `${market}:${ticker}`; if (seen.has(key)) continue; seen.add(key);
      const numeric = (value: unknown) => { const parsed = Number(String(value ?? "").replace(/,/g, "")); return Number.isFinite(parsed) ? parsed : null; };
      scopes.push({ market, code: ticker, name, rank: index + 1, changeRate: numeric(item.rate ?? item.changeRate ?? item.n_rate), rankingVolume: numeric(item.tvol ?? item.vol ?? item.volume), rankingTradeValue: numeric(item.tamt ?? item.tamnt ?? item.amount) });
    }
    const parsed = response?.response?.parsed as { rt_cd?: unknown; msg_cd?: unknown; msg1?: unknown; output1?: { nrec?: unknown } } | null;
    markets.push({ market, status: response?.status ?? 0, sourceCount: sourceRows.length, selectedCount: scopes.filter((item) => item.market === market).length, productExcluded, fallbackUsed, kis: { rtCd: parsed?.rt_cd ?? null, msgCd: parsed?.msg_cd ?? null, msg1: parsed?.msg1 ?? null, recordCount: parsed?.output1?.nrec ?? sourceRows.length }, rawTextPreview: response?.response?.rawText?.slice(0, 500) ?? "", error: sourceRows.length === 0 ? "KIS returned no TOP100 rows for this exchange; verify market hours and KIS ranking availability" : undefined });
  }
  const settings = await loadUsTurnoverFilterSettings();
  const filteredScopes = await applyCommonMarketCapFilter(scopes, settings);
  const availableMarkets = markets.filter((market) => Number(market.sourceCount) > 0).length;
  return { scopes: filteredScopes, universe: { ok: availableMarkets === US_EXCHANGES.length, source: "KIS_UPDOWN_RATE_TOP100", markets, availableMarketCount: availableMarkets, criteria: { exchanges: [...US_EXCHANGES], topN: 100, excludeEtfAndLeveraged: true, commonFilter: { enabled: settings.globalMinMarketCap > 0 || settings.globalMaxMarketCap > 0, minMarketCap: settings.globalMinMarketCap, maxMarketCap: settings.globalMaxMarketCap, unknownMarketCap: "excluded" } } } };
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
