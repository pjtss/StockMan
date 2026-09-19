import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb, getPool } from "@/lib/db";
import { usCommonStockUniverse } from "@/lib/schema";
import { classifyUsInstrumentProduct, isEligibleUsCommonStock } from "@/lib/us-instrument-product";
import { fetchKisUsTopRisingApi } from "@/lib/kis-us-api";
import { loadUsTurnoverFilterSettings, type UsTurnoverFilterSettings } from "@/lib/us-turnover-settings";
import { syncDailyActivityStatus } from "@/lib/daily-activity-status";
import { scoreIntradayCandidate } from "@/lib/intraday-candidate-priority";
import { intradayMemoryState } from "@/lib/intraday-memory-state";

export const US_EXCHANGES = ["NAS", "AMS", "NYS"] as const;
export const US_INTRADAY_FOCUS_POOL_SIZE = 30;
const EXCLUDED = /ETF|ETN|인버스|레버리지|inverse|leverag|\bshort\b|\b\d+(?:\.\d+)?x\b/i;
// KIS occasionally omits etyp_nm for exchange-traded products. These issuer
// and product-name hints prevent the live VWAP universe from treating an ETF
// as a common stock when provider metadata is incomplete.
const ETF_NAME_HINT = /\b(?:ISHARES|VISTASHARES|ROUNDHILL|KRANESHARES|KFA|SPDR|VANECK|PROSHARES|DIREXION|GLOBAL\s+X|INVESCO|GRANITESHARES|AMPLIFY|JANUS\s+HENDERSON)\b/i;
// KIS's overseas master marks many preferred shares, notes and units as
// security type 2 (stock). The official master name remains the authoritative
// product descriptor for these cases, so exclude them from common-stock scans.
export const EXCLUDED_US_OFFICIAL_NAME = /(?:preferred|\bpfd\b|\b(?:senior\s+)?notes?\b|\bnts\b|\bbonds?\b|\bunits?\b|\bwarrants?\b|\bright\b|\bdebentures?\b|우선주|채권|워런트)/i;
// KIS ranking responses commonly contain metadata in output1 and the actual
// rows in output2. Never prefer output1 merely because it exists: it is an
// object for successful responses and would otherwise hide output2 entirely.
function rows(parsed: any) {
  const candidates = [parsed?.output, parsed?.output2, parsed?.output1];
  const output = candidates.find((value) => Array.isArray(value));
  return Array.isArray(output) ? output.slice(0, 100) : [];
}
export function chooseTopRisingRows(primary: any, fallback: any) {
  const primaryRows = rows(primary);
  if (primaryRows.length >= 100) return { rows: primaryRows, fallbackUsed: false };
  const fallbackRows = rows(fallback);
  if (fallbackRows.length > primaryRows.length) return { rows: fallbackRows, fallbackUsed: true };
  return { rows: primaryRows, fallbackUsed: false };
}
function code(row: any) { return String(row.symb ?? row.rsym ?? row.code ?? "").replace(/^D[A-Z]{3}/, "").trim().toUpperCase(); }

export type UsTopRisingScope = { market: string; code: string; name?: string; rank?: number; changeRate?: number | null; rankingVolume?: number | null; rankingTradeValue?: number | null; marketCap?: number | null; priority?: number; turnoverToMarketCap?: number; priorityReasons?: string[] };

export function retainOfficialCommonStocks<T extends UsTopRisingScope>(scopes: T[], officialKeys: Set<string>) {
  return scopes.filter((scope) => officialKeys.has(`${scope.market}:${scope.code}`));
}

export async function applyCommonMarketCapFilter<T extends UsTopRisingScope>(scopes: T[], settings: UsTurnoverFilterSettings = DEFAULT_SETTINGS): Promise<T[]> {
  const enabled = settings.globalMinMarketCap > 0 || settings.globalMaxMarketCap > 0;
  if (!enabled || scopes.length === 0) return scopes;
  const caps = new Map<string, number | null>();
  // `null` can be a known lookup result (unknown market cap). Only query
  // scopes whose field was never populated; this avoids repeating the live
  // path's batch lookup for the same candidates.
  const missing = scopes.filter((scope) => !Object.prototype.hasOwnProperty.call(scope, "marketCap"));
  if (missing.length > 0) {
    const rows = await getPool().query<{ market: string; code: string; market_cap: number | null }>(
      "SELECT market, code, market_cap FROM instrument_fundamental_snapshots WHERE market = ANY($1::text[]) AND code = ANY($2::text[])",
      [Array.from(new Set(scopes.map((scope) => scope.market))), Array.from(new Set(missing.map((scope) => scope.code)))],
    ).then((result) => result.rows).catch(() => [] as Array<{ market: string; code: string; market_cap: number | null }>);
    for (const row of rows) caps.set(`${row.market}:${row.code}`, row.market_cap);
  }
  return scopes.filter((scope) => {
    const marketCap = scope.marketCap ?? caps.get(`${scope.market}:${scope.code}`) ?? null;
    return marketCap != null && marketCap >= settings.globalMinMarketCap && (settings.globalMaxMarketCap <= 0 || marketCap <= settings.globalMaxMarketCap);
  }).map((scope) => ({ ...scope, marketCap: scope.marketCap ?? caps.get(`${scope.market}:${scope.code}`) ?? null }));
}

const DEFAULT_SETTINGS: UsTurnoverFilterSettings = { maxPrice: 0, maxRate: 0, maxOpenToHighRate: 0, minMarketCap: 0, maxMarketCap: 0, globalMinMarketCap: 0, globalMaxMarketCap: 0, minTurnoverRatio: 0, maxTurnoverRatio: 0, tradingValueIncreaseAlert: 0, minIntensity: 0, minTradingValueRvol: 0, minTradingValueIncreaseRate: 0, minPersistenceWindows: 0 };
const STORED_SCOPE_CACHE_TTL_MS = 5 * 60_000;
const LIVE_SCOPE_CACHE_TTL_MS = 30_000;
const OFFICIAL_ELIGIBILITY_CACHE_TTL_MS = 60 * 60_000;
const OFFICIAL_ELIGIBILITY_CACHE_MAX_ENTRIES = 5_000;
const officialEligibilityCache = new Map<string, { eligible: boolean; expiresAt: number }>();
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
let liveScopeCache: { expiresAt: number; value: Awaited<ReturnType<typeof loadUsTopRisingScopesUncached>> } | null = null;
let liveScopeInflight: Promise<Awaited<ReturnType<typeof loadUsTopRisingScopesUncached>>> | null = null;

export function clearOfficialEligibilityCache() {
  officialEligibilityCache.clear();
}

async function loadOfficialEligibility(scopes: UsTopRisingScope[]) {
  const now = Date.now();
  for (const [key, entry] of officialEligibilityCache) {
    if (entry.expiresAt <= now) officialEligibilityCache.delete(key);
  }
  const keys = [...new Set(scopes.map((scope) => `${scope.market}:${scope.code}`))];
  const eligibleKeys = new Set<string>();
  const missingKeys: string[] = [];
  for (const key of keys) {
    const cached = officialEligibilityCache.get(key);
    if (cached && cached.expiresAt > now) {
      if (cached.eligible) eligibleKeys.add(key);
    } else {
      missingKeys.push(key);
    }
  }
  if (missingKeys.length === 0) return { eligibleKeys, lookupFailed: false, cacheHits: keys.length, cacheMisses: 0 };
  const pairs = missingKeys.map((key) => { const separator = key.indexOf(":"); return { market: key.slice(0, separator), code: key.slice(separator + 1) }; });
  const query = `SELECT u.market, u.code FROM us_common_stock_universe u
       JOIN unnest($1::text[], $2::text[]) AS requested(market, code)
         ON u.market = requested.market AND u.code = requested.code
       WHERE u.enabled = TRUE AND u.daily_active = TRUE
         AND u.instrument_type = 'COMMON_STOCK'
         AND u.is_etf = FALSE AND u.is_warrant = FALSE AND u.is_derivative = FALSE
         AND u.is_dr = FALSE AND u.is_leveraged = FALSE AND u.is_inverse = FALSE`;
  const compatibilityQuery = `SELECT u.market, u.code FROM us_common_stock_universe u
       JOIN unnest($1::text[], $2::text[]) AS requested(market, code)
         ON u.market = requested.market AND u.code = requested.code
       WHERE u.enabled = TRUE
         AND u.instrument_type = 'COMMON_STOCK'
         AND u.is_etf = FALSE AND u.is_warrant = FALSE AND u.is_derivative = FALSE
         AND u.is_dr = FALSE AND u.is_leveraged = FALSE AND u.is_inverse = FALSE`;
  let lookupFallbackUsed = false;
  try {
    let result: { rows: Array<{ market: string; code: string }> };
    try {
      result = await getPool().query<{ market: string; code: string }>(query, [pairs.map((pair) => pair.market), pairs.map((pair) => pair.code)]);
    } catch (error) {
      // V100 added daily_active. Older production databases can temporarily
      // report a lower Flyway schema while still having the authoritative
      // product columns. Do not turn that compatibility case into zero
      // candidates; omit only the optional activity column and preserve the
      // common-stock/product fail-closed filters.
      const message = error instanceof Error ? error.message : String(error);
      if (!/daily_active|column .* does not exist/i.test(message)) throw error;
      lookupFallbackUsed = true;
      result = await getPool().query<{ market: string; code: string }>(compatibilityQuery, [pairs.map((pair) => pair.market), pairs.map((pair) => pair.code)]);
    }
    const loaded = new Set(result.rows.map((row) => `${row.market}:${row.code}`));
    for (const key of missingKeys) {
      const eligible = loaded.has(key);
      officialEligibilityCache.set(key, { eligible, expiresAt: now + OFFICIAL_ELIGIBILITY_CACHE_TTL_MS });
      if (eligible) eligibleKeys.add(key);
    }
    while (officialEligibilityCache.size > OFFICIAL_ELIGIBILITY_CACHE_MAX_ENTRIES) {
      const oldestKey = officialEligibilityCache.keys().next().value as string | undefined;
      if (!oldestKey) break;
      officialEligibilityCache.delete(oldestKey);
    }
    return { eligibleKeys, lookupFailed: false, lookupFallbackUsed, cacheHits: keys.length - missingKeys.length, cacheMisses: missingKeys.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[US TOP RISING] official eligibility lookup failed; detection is fail-closed:", message);
    return { eligibleKeys: new Set<string>(), lookupFailed: true, lookupFallbackUsed, lookupError: message.slice(0, 240), cacheHits: keys.length - missingKeys.length, cacheMisses: missingKeys.length };
  }
}

/** Canonical persisted universe used by daily indicators. No live ranking API is called. */
export async function loadStoredUsInstrumentScopes(): Promise<StoredUsInstrumentScopes> {
  if (storedScopeCache && storedScopeCache.expiresAt > Date.now()) return storedScopeCache.value;
  if (storedScopeInflight) return storedScopeInflight;
  storedScopeInflight = (async () => {
    await syncDailyActivityStatus("US");
    const db = getDb();
    const rows = db ? await db.select({ market: usCommonStockUniverse.market, code: usCommonStockUniverse.code, name: usCommonStockUniverse.name, englishName: usCommonStockUniverse.englishName, instrumentType: usCommonStockUniverse.instrumentType, isEtf: usCommonStockUniverse.isEtf, isLeveraged: usCommonStockUniverse.isLeveraged, isInverse: usCommonStockUniverse.isInverse, isWarrant: usCommonStockUniverse.isWarrant, isDerivative: usCommonStockUniverse.isDerivative, isDr: usCommonStockUniverse.isDr })
      .from(usCommonStockUniverse).where(and(eq(usCommonStockUniverse.enabled, true), sql`daily_active = true`, inArray(usCommonStockUniverse.market, [...US_EXCHANGES])))
      : [];
    const settings = await loadUsTurnoverFilterSettings();
    // Cache membership is deliberately independent from market-cap, turnover,
    // price and volume policies. Only the official persisted product type is
    // authoritative here; live scanners may apply their own ranking filters.
    const eligibleRows = rows.filter((row) => row.instrumentType === "COMMON_STOCK" && !row.isEtf && !row.isWarrant && !row.isDerivative && !row.isDr && !row.isLeveraged && !row.isInverse && !EXCLUDED_US_OFFICIAL_NAME.test(`${row.name ?? ""} ${row.englishName ?? ""}`));
    // The persisted KIS master contains product metadata but not a numeric
    // market-cap value. Applying a numeric cap filter here would therefore
    // treat every row as unknown and silently reduce the cache universe to 0.
    // Market-cap filtering remains active for live ranking rows that actually
    // provide a marketCap value; the stored master is filtered by product type.
    const scopes = eligibleRows.map((row, index) => ({ market: row.market, code: row.code, name: row.name, rank: index + 1, changeRate: null, rankingVolume: null, rankingTradeValue: null }));
    const commonFilterEnabled = settings.globalMinMarketCap > 0 || settings.globalMaxMarketCap > 0;
    return { scopes, universe: { ok: true, source: "DB_INTEGRATED_US_INSTRUMENT_UNIVERSE", markets: US_EXCHANGES.map((market) => ({ market, sourceCount: scopes.filter((item) => item.market === market).length })), availableMarketCount: new Set(scopes.map((item) => item.market)).size, criteria: { exchanges: [...US_EXCHANGES], source: "us_instrument_universe", instrumentType: "COMMON_STOCK", numericFilters: "NONE", ignoredTurnoverSettings: commonFilterEnabled ? { minMarketCap: settings.globalMinMarketCap, maxMarketCap: settings.globalMaxMarketCap } : null } } };
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
  if (liveScopeCache && liveScopeCache.expiresAt > Date.now()) return liveScopeCache.value;
  if (liveScopeInflight) return liveScopeInflight;
  liveScopeInflight = loadUsTopRisingScopesUncached();
  try {
    const value = await liveScopeInflight;
    liveScopeCache = { value, expiresAt: Date.now() + LIVE_SCOPE_CACHE_TTL_MS };
    return value;
  } finally {
    liveScopeInflight = null;
  }
}

async function loadUsTopRisingScopesUncached() {
  const seen = new Set<string>();
  const loadMarket = async (market: typeof US_EXCHANGES[number]) => {
    const selected: UsTopRisingScope[] = [];
    let response = await fetchKisUsTopRisingApi({ excd: market });
    let sourceRows = rows(response?.response?.parsed); let fallbackUsed = false;
    // Some KIS sessions return HTTP 200/rt_cd=0 with only a partial page when
    // the configured volume range is applied. Keep the full TOP100 contract:
    // prefer a richer VOL_RANG=0 response rather than silently treating a
    // short page as complete.
    if (sourceRows.length < 100) {
      const fallback = await fetchKisUsTopRisingApi({ excd: market, volRang: "0" });
      const selected = chooseTopRisingRows(response?.response?.parsed, fallback?.response?.parsed);
      if (selected.fallbackUsed) { response = fallback; sourceRows = selected.rows; fallbackUsed = true; }
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
      selected.push({ market, code: ticker, name, rank: index + 1, changeRate: numeric(item.rate ?? item.changeRate ?? item.n_rate), rankingVolume: numeric(item.tvol ?? item.vol ?? item.volume), rankingTradeValue: numeric(item.tamt ?? item.tamnt ?? item.amount), marketCap: numeric(item.marketCap ?? item.market_cap ?? item.mcap ?? item.stck_avls ?? item.stckAvls) });
    }
    const parsed = response?.response?.parsed as { rt_cd?: unknown; msg_cd?: unknown; msg1?: unknown; output1?: { nrec?: unknown } } | null;
    return { selected, market: { market, status: response?.status ?? 0, sourceCount: sourceRows.length, selectedCount: selected.length, productExcluded, fallbackUsed, kis: { rtCd: parsed?.rt_cd ?? null, msgCd: parsed?.msg_cd ?? null, msg1: parsed?.msg1 ?? null, recordCount: parsed?.output1?.nrec ?? sourceRows.length }, rawTextPreview: response?.response?.rawText?.slice(0, 500) ?? "", error: sourceRows.length === 0 ? "KIS returned no TOP100 rows for this exchange; verify market hours and KIS ranking availability" : undefined } };
  };
  const marketResults = await Promise.all(US_EXCHANGES.map(loadMarket));
  const scopes: UsTopRisingScope[] = []; const markets: Record<string, unknown>[] = [];
  // `seen` is populated while each exchange is parsed. Do not check it again
  // here: that would discard every valid row before the API response is built.
  for (const result of marketResults) { markets.push(result.market); scopes.push(...result.selected); }
  // The live KIS ranking is only a candidate source. The persisted official
  // universe is authoritative for detection eligibility. Fail closed when the
  // lookup cannot prove that a row is an active common stock.
  const officialEligibility = await loadOfficialEligibility(scopes);
  const officialCommonStockKeys = officialEligibility.eligibleKeys;
  const sourceScopeCount = scopes.length;
  const officialScopes = retainOfficialCommonStocks(scopes, officialCommonStockKeys);
  scopes.length = 0;
  scopes.push(...officialScopes);
  const settings = await loadUsTurnoverFilterSettings();
  if (settings.globalMinMarketCap > 0 || settings.globalMaxMarketCap > 0) {
    const capRows = await getPool().query<{ market: string; code: string; market_cap: number | null }>("SELECT market, code, market_cap FROM instrument_fundamental_snapshots WHERE market = ANY($1::text[]) AND code = ANY($2::text[])", [[...US_EXCHANGES], scopes.map((scope) => scope.code)]).catch(() => ({ rows: [] as Array<{ market: string; code: string; market_cap: number | null }> }));
    const caps = new Map(capRows.rows.map((row) => [`${row.market}:${row.code}`, row.market_cap]));
    for (const scope of scopes) scope.marketCap = caps.get(`${scope.market}:${scope.code}`) ?? null;
  }
  const filteredScopes = await applyCommonMarketCapFilter(scopes, settings);
  const scoredByKey = new Map<string, ReturnType<typeof scoreIntradayCandidate>>();
  const prioritizedScopes = filteredScopes.map((scope) => {
    const scored = scoreIntradayCandidate({ market: scope.market, code: scope.code, currency: "USD", marketCap: scope.marketCap ?? null, tradingValue: scope.rankingTradeValue ?? null, isTopRising: true, isNewEntry: false, rankChange: 0, rateChange: scope.changeRate ?? 0, volumeChange: 0, aboveVwap: false });
    scoredByKey.set(`${scope.market}:${scope.code}`, scored);
    return scored ? { ...scope, priority: scored.priority, turnoverToMarketCap: scored.turnoverToMarketCap, priorityReasons: scored.reasons } : scope;
  }).sort((a, b) => (b.priority ?? -1) - (a.priority ?? -1));
  // Focus selection is intentionally downstream of product eligibility and
  // market-cap filtering. Only the final common-stock candidate set may enter
  // high-frequency tracking; raw KIS ranking rows never enter this pool.
  const focusKeys = new Set(prioritizedScopes.slice(0, US_INTRADAY_FOCUS_POOL_SIZE).map((scope) => `${scope.market}:${scope.code}`));
  for (const [index, scope] of prioritizedScopes.entries()) {
    const scored = scoredByKey.get(`${scope.market}:${scope.code}`) ?? null;
    if (!scored) continue;
    const isFocused = focusKeys.has(`${scope.market}:${scope.code}`);
    const previous = intradayMemoryState.getCandidate(scope.market, scope.code);
    intradayMemoryState.upsertCandidate({ ...previous, ...scored, mvpTracking: true, focusTracking: isFocused, focusRank: isFocused ? index + 1 : undefined });
  }
  intradayMemoryState.rotateSnapshot(prioritizedScopes.map((scope) => ({ market: scope.market, code: scope.code, name: scope.name, rank: scope.rank, rate: scope.changeRate ?? undefined, volume: scope.rankingVolume ?? undefined, tradingValue: scope.rankingTradeValue ?? undefined })));
  const availableMarkets = markets.filter((market) => Number(market.sourceCount) > 0).length;
  const hasSuccessfulResponse = markets.some((market) => market.status === 200 && (market as any).kis?.rtCd === "0");
  return { scopes: prioritizedScopes, universe: { ok: hasSuccessfulResponse, complete: availableMarkets === US_EXCHANGES.length, source: "KIS_UPDOWN_RATE_TOP100", markets, availableMarketCount: availableMarkets, criteria: { exchanges: [...US_EXCHANGES], topNPerExchange: 100, maxSourceRows: 300, excludeEtfAndLeveraged: true, commonFilter: { enabled: settings.globalMinMarketCap > 0 || settings.globalMaxMarketCap > 0, minMarketCap: settings.globalMinMarketCap, maxMarketCap: settings.globalMaxMarketCap, unknownMarketCap: "excluded" }, officialEligibility: { source: "us_common_stock_universe", enabled: true, dailyActive: true, instrumentType: "COMMON_STOCK", sourceScopeCount, eligibleScopeCount: officialScopes.length, unknownOrInactiveExcluded: sourceScopeCount - officialScopes.length, failClosed: true, cache: "process_memory", cacheTtlSeconds: OFFICIAL_ELIGIBILITY_CACHE_TTL_MS / 1000, cacheHits: officialEligibility.cacheHits, cacheMisses: officialEligibility.cacheMisses, lookupFailed: officialEligibility.lookupFailed, lookupFallbackUsed: officialEligibility.lookupFallbackUsed, lookupError: officialEligibility.lookupError }, priority: "turnover_to_market_cap_plus_intraday_signals", focusPool: { size: US_INTRADAY_FOCUS_POOL_SIZE, selection: "priority_desc_after_product_and_market_cap_filters", refresh: "every_live_scope_refresh", eligibleUniverse: "active_common_stock_only" }, currency: "USD", emptyResponse: "normal_successful_response_is_not_transport_error" } } };
}
