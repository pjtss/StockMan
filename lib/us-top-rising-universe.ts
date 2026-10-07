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
export function parseOptionalKisNumber(value: unknown): number | null {
  if (value == null) return null;
  const text = String(value).trim().replace(/,/g, "");
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}
export function parseKisSourceRank(row: unknown, fallbackRank: number) {
  const sourceRank = parseOptionalKisNumber((row as any)?.rank ?? (row as any)?.rank_no ?? (row as any)?.rnk);
  return sourceRank != null && Number.isInteger(sourceRank) && sourceRank > 0 ? sourceRank : fallbackRank;
}
export function chooseTopRisingRows(primary: any, fallback: any) {
  const primaryRows = rows(primary);
  if (primaryRows.length >= 100) return { rows: primaryRows, fallbackUsed: false };
  const fallbackRows = rows(fallback);
  if (fallbackRows.length > primaryRows.length) return { rows: fallbackRows, fallbackUsed: true };
  return { rows: primaryRows, fallbackUsed: false };
}
export function isSuccessfulTopRisingResponse(response: { status?: number; response?: { parsed?: any } } | null | undefined) {
  return Boolean(response && Number(response.status) >= 200 && Number(response.status) < 300 && String(response.response?.parsed?.rt_cd ?? "") === "0");
}
export function chooseTopRisingResponses(primary: any, fallback: any) {
  const primaryOk = isSuccessfulTopRisingResponse(primary);
  const fallbackOk = isSuccessfulTopRisingResponse(fallback);
  const primaryRows = primaryOk ? rows(primary?.response?.parsed) : [];
  const fallbackRows = fallbackOk ? rows(fallback?.response?.parsed) : [];
  if (fallbackOk && (!primaryOk || fallbackRows.length > primaryRows.length)) return { response: fallback, rows: fallbackRows, fallbackUsed: true };
  return { response: primaryOk ? primary : fallbackOk ? fallback : primary, rows: primaryRows, fallbackUsed: false };
}
export function isCompleteUsTopRisingMarket(input: { status: number; rtCd: unknown; sourceCount: number }) {
  return input.status >= 200 && input.status < 300 && String(input.rtCd ?? "") === "0" && input.sourceCount >= 100;
}
export function selectIntradayFocusKeys<T extends UsTopRisingScope>(
  scopes: T[],
  scoresByKey: Map<string, ReturnType<typeof scoreIntradayCandidate>>,
  limit = US_INTRADAY_FOCUS_POOL_SIZE,
) {
  const maxItems = Math.max(0, limit);
  // Minute candles are the source for the live turnover signal. The upstream
  // gainers ranking often omits both market cap and traded value, so requiring
  // a pre-existing score here can leave the minute queue empty forever. Keep
  // score-ranked candidates first, then fill the remaining bounded queue in
  // the already source-ranked order; callers have already applied the official
  // active-common-stock and configured market-cap filters.
  const scored = scopes.filter((scope) => scoresByKey.get(`${scope.market}:${scope.code}`) != null);
  const scoredKeys = new Set(scored.map((scope) => `${scope.market}:${scope.code}`));
  const remainderByMarket = new Map<string, T[]>();
  for (const scope of scopes) {
    if (scoredKeys.has(`${scope.market}:${scope.code}`)) continue;
    const marketScopes = remainderByMarket.get(scope.market) ?? [];
    marketScopes.push(scope);
    remainderByMarket.set(scope.market, marketScopes);
  }
  // A market's rows arrive in contiguous batches (NAS, AMS, NYS). Selecting
  // the fallback pool by array order would spend all 30 slots on NAS whenever
  // KIS omits score inputs. Round-robin by market, preserving each market's
  // source rank order, while keeping scoreable candidates globally first.
  const markets = [...remainderByMarket.keys()];
  const balancedRemainder: T[] = [];
  for (let rankIndex = 0; markets.some((market) => rankIndex < (remainderByMarket.get(market)?.length ?? 0)); rankIndex += 1) {
    for (const market of markets) {
      const scope = remainderByMarket.get(market)?.[rankIndex];
      if (scope) balancedRemainder.push(scope);
    }
  }
  return new Set([...scored, ...balancedRemainder].slice(0, maxItems).map((scope) => `${scope.market}:${scope.code}`));
}
function code(row: any) { return String(row.symb ?? row.rsym ?? row.code ?? "").replace(/^D[A-Z]{3}/, "").trim().toUpperCase(); }

export type UsTopRisingScope = { market: string; code: string; name?: string; rank?: number; changeRate?: number | null; rankingVolume?: number | null; rankingTradeValue?: number | null; marketCap?: number | null; priority?: number; turnoverToMarketCap?: number; priorityReasons?: string[]; focusTracking?: boolean };

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

/** Returns the last upstream result without refreshing it, including its true source timestamp. */
export function getCachedUsTopRisingScopes() {
  return liveScopeCache?.value ?? null;
}

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
    let response: Awaited<ReturnType<typeof fetchKisUsTopRisingApi>> = null;
    let sourceRows: any[] = [];
    let fallbackUsed = false;
    let primaryError: string | undefined;
    let fallbackError: string | undefined;
    try {
      response = await fetchKisUsTopRisingApi({ excd: market });
    } catch (error) {
      primaryError = `primary: ${error instanceof Error ? error.message : String(error)}`.slice(0, 180);
    }
    sourceRows = isSuccessfulTopRisingResponse(response) ? rows(response?.response?.parsed) : [];
    if (response && !isSuccessfulTopRisingResponse(response)) primaryError = `primary response unsuccessful (${response.status})`;
    // Some KIS sessions return HTTP 200/rt_cd=0 with only a partial page when
    // the configured volume range is applied. Keep the full TOP100 contract:
    // prefer a richer VOL_RANG=0 response rather than silently treating a
    // short page as complete.
    if (sourceRows.length < 100) {
      try {
        const fallback = await fetchKisUsTopRisingApi({ excd: market, volRang: "0" });
        const selection = chooseTopRisingResponses(response, fallback);
        response = selection.response;
        sourceRows = selection.rows;
        fallbackUsed = selection.fallbackUsed;
        if (!isSuccessfulTopRisingResponse(fallback)) fallbackError = `fallback response unsuccessful (${fallback?.status ?? "no response"})`;
      } catch (error) {
        fallbackError = `fallback: ${error instanceof Error ? error.message : String(error)}`.slice(0, 180);
      }
    }
    const parsed = response?.response?.parsed as { rt_cd?: unknown; msg_cd?: unknown; msg1?: unknown; output1?: { nrec?: unknown } } | null;
    const responseOk = isSuccessfulTopRisingResponse(response);
    const collectedAt = new Date().toISOString();
    const sourceComplete = isCompleteUsTopRisingMarket({ status: response?.status ?? 0, rtCd: parsed?.rt_cd, sourceCount: sourceRows.length });
    let productExcluded = 0;
    let invalidRows = 0;
    let duplicateExcluded = 0;
    for (const [index, item] of sourceRows.entries()) {
      const ticker = code(item);
      const name = [item.name, item.company, item.enName, item.ename].map((value) => String(value ?? "").trim()).find(Boolean) ?? "";
      const product = classifyUsInstrumentProduct({ name, englishName: item.ename, type: item.etyp_nm, market });
      const productText = `${name} ${String(item.ename ?? "")} ${String(item.etyp_nm ?? "")}`;
      const excluded = !isEligibleUsCommonStock(product) || EXCLUDED.test(productText) || ETF_NAME_HINT.test(productText);
      if (!ticker) { invalidRows += 1; continue; }
      if (excluded) { productExcluded += 1; continue; }
      const key = `${market}:${ticker}`;
      if (seen.has(key)) { duplicateExcluded += 1; continue; }
      seen.add(key);
      selected.push({
        market,
        code: ticker,
        name,
        rank: parseKisSourceRank(item, index + 1),
        changeRate: parseOptionalKisNumber(item.rate ?? item.changeRate ?? item.n_rate),
        rankingVolume: parseOptionalKisNumber(item.tvol ?? item.vol ?? item.volume),
        rankingTradeValue: parseOptionalKisNumber(item.tamt ?? item.tamnt ?? item.amount ?? item.tradeValue ?? item.tradingValue),
        marketCap: parseOptionalKisNumber(item.marketCap ?? item.market_cap ?? item.mcap ?? item.stck_avls ?? item.stckAvls),
      });
    }
    const errorMessage = !responseOk
      ? `KIS_RESPONSE_NOT_SUCCESSFUL: ${String(parsed?.msg_cd ?? response?.status ?? "NO_RESPONSE")}${primaryError ? `; ${primaryError}` : ""}${fallbackError ? `; fallback: ${fallbackError}` : ""}`
      : sourceRows.length === 0
        ? "NO_RANKING_ROWS: KIS returned a successful response without rows"
        : sourceRows.length < 100
          ? `PARTIAL_RANKING_PAGE: received ${sourceRows.length}/100 rows${fallbackError ? `; fallback failed: ${fallbackError}` : ""}`
          : undefined;
    return { selected, market: { market, status: response?.status ?? 0, sourceCount: sourceRows.length, selectedCount: selected.length, productExcluded, invalidRows, duplicateExcluded, fallbackUsed, responseOk, sourceComplete, collectedAt, kis: { rtCd: parsed?.rt_cd ?? null, msgCd: parsed?.msg_cd ?? null, msg1: parsed?.msg1 ?? null, recordCount: parsed?.output1?.nrec ?? sourceRows.length }, error: errorMessage, warning: primaryError && responseOk ? `기본 순위 요청 실패 후 전체 순위 재조회로 복구됨: ${primaryError}` : undefined } };
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
  const focusKeys = selectIntradayFocusKeys(prioritizedScopes, scoredByKey);
  const focusRanks = new Map([...focusKeys].map((key, index) => [key, index + 1]));
  for (const scope of prioritizedScopes) {
    const key = `${scope.market}:${scope.code}`;
    const scored = scoredByKey.get(key) ?? null;
    const previous = intradayMemoryState.getCandidate(scope.market, scope.code);
    if (!scored) {
      // Rank-selected candidates still need minute candles even when the KIS
      // ranking omits market cap/trading value. Amount windows remain visible;
      // the market-cap ratio and ratio-based alert stay unavailable until a
      // valid cap is known. Never synthesize the missing financial inputs.
      const isFocused = focusKeys.has(key);
      if (isFocused) intradayMemoryState.upsertCandidate({
        ...previous,
        market: scope.market,
        code: scope.code,
        priority: previous?.priority ?? Math.max(1, 101 - (scope.rank ?? 100)),
        lastSeenAt: Date.now(),
        lastCheckedAt: previous?.lastCheckedAt ?? 0,
        nextCheckAt: previous?.nextCheckAt ?? Date.now(),
        consecutiveFailures: previous?.consecutiveFailures ?? 0,
        marketCap: scope.marketCap ?? null,
        tradingValue: scope.rankingTradeValue ?? null,
        mvpTracking: true,
        focusTracking: true,
        focusRank: focusRanks.get(key),
      });
      else if (previous) intradayMemoryState.upsertCandidate({ ...previous, marketCap: scope.marketCap ?? null, tradingValue: scope.rankingTradeValue ?? null, mvpTracking: true, focusTracking: false, focusRank: undefined });
      continue;
    }
    const isFocused = focusKeys.has(key);
    intradayMemoryState.upsertCandidate({ ...previous, ...scored, mvpTracking: true, focusTracking: isFocused, focusRank: isFocused ? focusRanks.get(key) : undefined });
  }
  const displayScopes = prioritizedScopes.map((scope) => {
    const key = `${scope.market}:${scope.code}`;
    const focusRank = focusRanks.get(key);
    return { ...scope, focusTracking: focusRank != null, focusRank };
  });
  intradayMemoryState.rotateSnapshot(prioritizedScopes.map((scope) => ({ market: scope.market, code: scope.code, name: scope.name, rank: scope.rank, rate: scope.changeRate ?? undefined, volume: scope.rankingVolume ?? undefined, tradingValue: scope.rankingTradeValue ?? undefined })));
  const availableMarkets = markets.filter((market) => Boolean((market as any).responseOk)).length;
  const completeMarkets = markets.filter((market) => Boolean((market as any).sourceComplete)).length;
  const collectedAt = markets.map((market) => Date.parse(String((market as any).collectedAt ?? ""))).filter(Number.isFinite).reduce((latest, value) => Math.max(latest, value), 0);
  const collectedAtIso = collectedAt ? new Date(collectedAt).toISOString() : null;
  for (const market of markets) (market as any).eligibleCommonStockCount = displayScopes.filter((scope) => scope.market === (market as any).market).length;
  return { scopes: displayScopes, universe: { ok: availableMarkets > 0, complete: completeMarkets === US_EXCHANGES.length, source: "KIS_UPDOWN_RATE_TOP100", collectedAt: collectedAtIso, markets, availableMarketCount: availableMarkets, completeMarketCount: completeMarkets, criteria: { exchanges: [...US_EXCHANGES], topNPerExchange: 100, maxSourceRows: 300, excludeEtfAndLeveraged: true, commonFilter: { enabled: settings.globalMinMarketCap > 0 || settings.globalMaxMarketCap > 0, minMarketCap: settings.globalMinMarketCap, maxMarketCap: settings.globalMaxMarketCap, unknownMarketCap: "excluded" }, officialEligibility: { source: "us_common_stock_universe", enabled: true, dailyActive: true, instrumentType: "COMMON_STOCK", sourceScopeCount, eligibleScopeCount: officialScopes.length, unknownOrInactiveExcluded: sourceScopeCount - officialScopes.length, failClosed: true, cache: "process_memory", cacheTtlSeconds: OFFICIAL_ELIGIBILITY_CACHE_TTL_MS / 1000, cacheHits: officialEligibility.cacheHits, cacheMisses: officialEligibility.cacheMisses, lookupFailed: officialEligibility.lookupFailed, lookupFallbackUsed: officialEligibility.lookupFallbackUsed, lookupError: officialEligibility.lookupError }, priority: "turnover_to_market_cap_plus_intraday_signals", focusPool: { size: US_INTRADAY_FOCUS_POOL_SIZE, selection: "priority_desc_after_product_and_market_cap_filters", refresh: "every_live_scope_refresh", eligibleUniverse: "active_common_stock_only" }, currency: "USD", emptyResponse: "normal_successful_response_is_not_transport_error" } } };
}
