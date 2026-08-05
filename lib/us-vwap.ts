import { and, eq, gte, desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { usIntradayVwapAlerts, usIntradayVwapSnapshots } from "@/lib/schema-vwap";
import { fetchUsMinuteTurnover } from "@/lib/kis-us-minute-turnover";
import { loadFeatureModuleSettings } from "@/lib/feature-module-settings";
import { loadUsTurnoverFilterSettings } from "@/lib/us-turnover-settings";
import { sendUsTurnoverRatioToDiscord } from "@/lib/discord-us-turnover-ratio";
import { usTurnoverRatioSnapshotAttempts, usTurnoverRatioSnapshots } from "@/lib/schema";
import { loadUsTopRisingScopes, type UsTopRisingScope } from "@/lib/us-top-rising-universe";

export const VWAP_MARKETS = ["AMS", "NAS", "NYS"] as const;
type Scope = UsTopRisingScope;
type Row = Record<string, unknown>;
type VwapPolicy = { minAbovePercent: number; minVolume: number; minTradeValue: number; minPointCount: number; minTurnoverRatio: number; requireComplete: boolean };
export type VwapResult = { market: string; code: string; name?: string; sessionDate: string; vwap: number | null; currentPrice: number | null; totalVolume: number; totalTradeValue: number; pointCount: number; complete: boolean; qualifies: boolean; diagnostics: Record<string, unknown> };

function dateKst() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date()).replaceAll("-", ""); }
function number(value: unknown) { const n = Number(String(value ?? "").replace(/,/g, "")); return Number.isFinite(n) ? n : null; }
const watchlistScopes = loadUsTopRisingScopes;

function derive(points: Array<{ price: number; volume: number; tradeValue: number; time?: string }>, currentPrice: number | null, complete: boolean, diagnostics: Record<string, unknown>, scope: Scope, sessionDate: string, policy: VwapPolicy, turnoverRatio: number | null): VwapResult {
  const totalVolume = points.reduce((sum, row) => sum + row.volume, 0); const totalTradeValue = points.reduce((sum, row) => sum + row.tradeValue, 0);
  const vwap = totalVolume > 0 ? totalTradeValue / totalVolume : null;
  const qualifies = vwap != null && currentPrice != null && turnoverRatio != null && turnoverRatio >= policy.minTurnoverRatio && (!policy.requireComplete || complete) && currentPrice >= vwap * (1 + policy.minAbovePercent / 100) && totalVolume >= policy.minVolume && totalTradeValue >= policy.minTradeValue && points.length >= policy.minPointCount;
  return { ...scope, sessionDate, vwap, currentPrice, totalVolume, totalTradeValue, pointCount: points.length, complete, qualifies, diagnostics: { ...diagnostics, turnoverRatio, filter: { ...policy }, qualification: { aboveVwapPercent: vwap && currentPrice != null ? ((currentPrice / vwap) - 1) * 100 : null, qualifies, turnoverRatioPassed: turnoverRatio != null && turnoverRatio >= policy.minTurnoverRatio } } };
}

async function loadTurnoverRatios(scopes: Scope[]) {
  const db = getDb(); const map = new Map<string, number>(); if (!db || !scopes.length) return map;
  const allowed = new Set(scopes.map((scope) => `${scope.market}:${scope.code}`));
  const rows = await db.select({ market: usTurnoverRatioSnapshots.market, code: usTurnoverRatioSnapshots.code, turnoverRatio: usTurnoverRatioSnapshots.turnoverRatio }).from(usTurnoverRatioSnapshots).where(gte(usTurnoverRatioSnapshots.observedAt, new Date(Date.now() - 24 * 60 * 60 * 1000))).orderBy(desc(usTurnoverRatioSnapshots.observedAt));
  for (const row of rows) { const key = `${row.market}:${row.code}`; if (allowed.has(key) && !map.has(key)) map.set(key, row.turnoverRatio); }
  if (map.size < allowed.size) {
    const attempts = await db.select({ market: usTurnoverRatioSnapshotAttempts.market, code: usTurnoverRatioSnapshotAttempts.code, turnoverRatio: usTurnoverRatioSnapshotAttempts.turnoverRatio }).from(usTurnoverRatioSnapshotAttempts).where(gte(usTurnoverRatioSnapshotAttempts.observedAt, new Date(Date.now() - 24 * 60 * 60 * 1000))).orderBy(desc(usTurnoverRatioSnapshotAttempts.observedAt));
    for (const row of attempts) { const key = `${row.market}:${row.code}`; if (allowed.has(key) && row.turnoverRatio != null && !map.has(key)) map.set(key, row.turnoverRatio); }
  }
  return map;
}

async function loadRecentCache(scopes: Scope[], sessionDate: string, ttlMs: number, policy: VwapPolicy, turnoverRatios: Map<string, number>) {
  const db = getDb(); const map = new Map<string, VwapResult>();
  if (!db || !scopes.length) return map;
  const rows = await db.select().from(usIntradayVwapSnapshots).where(and(eq(usIntradayVwapSnapshots.sessionDate, sessionDate), gte(usIntradayVwapSnapshots.observedAt, new Date(Date.now() - ttlMs))));
  const allowed = new Set(scopes.map((scope) => `${scope.market}:${scope.code}`));
  for (const row of rows) if (row.complete && allowed.has(`${row.market}:${row.code}`) && row.vwap != null && row.currentPrice != null && row.pointCount > 0) {
    const scope = scopes.find((item) => item.market === row.market && item.code === row.code);
    if (scope) { const turnoverRatio = turnoverRatios.get(`${row.market}:${row.code}`) ?? null; const qualifies = turnoverRatio != null && turnoverRatio >= policy.minTurnoverRatio && row.currentPrice >= row.vwap * (1 + policy.minAbovePercent / 100) && row.totalVolume >= policy.minVolume && row.totalTradeValue >= policy.minTradeValue && row.pointCount >= policy.minPointCount; map.set(`${row.market}:${row.code}`, { ...scope, sessionDate, vwap: row.vwap, currentPrice: row.currentPrice, totalVolume: row.totalVolume, totalTradeValue: row.totalTradeValue, pointCount: row.pointCount, complete: row.complete, qualifies, diagnostics: { ...(row.diagnostics as Record<string, unknown>), cacheHit: true, cacheAgeMs: Date.now() - row.observedAt.getTime(), turnoverRatio, filter: policy } }); }
  }
  return map;
}

async function executeUsVwapScan(options: { scopes?: Scope[]; universe?: Record<string, unknown>; concurrency?: number; cacheTtlMs?: number } = {}) {
  const sessionDate = dateKst(); const module = await loadFeatureModuleSettings("us-vwap"); const policy = { minAbovePercent: 0, minVolume: 0, minTradeValue: 0, minPointCount: 1, minTurnoverRatio: 0, requireComplete: true, ...module.featureSettings?.vwapPolicy }; const selected = options.scopes ? { scopes: options.scopes, universe: options.universe ?? {} } : await watchlistScopes(); const scopes = selected.scopes; const turnoverRatios = await loadTurnoverRatios(scopes); const cache = await loadRecentCache(scopes, sessionDate, options.cacheTtlMs ?? 45_000, policy, turnoverRatios);
  const results: VwapResult[] = [...cache.values()]; const errors: Array<Record<string, unknown>> = []; const pending = scopes.filter((scope) => !cache.has(`${scope.market}:${scope.code}`)); let nextIndex = 0;
  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  async function worker() {
    while (true) {
      const scope = pending[nextIndex++]; if (!scope) return;
      try {
        await delay(250);
        const response = await fetchUsMinuteTurnover({ code: scope.code, market: scope.market });
        if (!response) throw new Error("KIS access token unavailable");
        const points = response.points.map((point: any) => { const raw = (point.raw ?? {}) as Row; const volume = number(raw.evol ?? raw.volume ?? raw.cntg_vol ?? raw.tvol) ?? 0; const tradeValue = number(raw.eamt ?? raw.trade_amount ?? raw.pbmn) ?? (point.price * volume); return { price: point.price, volume, tradeValue, time: point.time }; }).filter((point) => point.price > 0 && point.volume > 0);
        if (!response.ok || response.status < 200 || response.status >= 300 || points.length === 0) { errors.push({ ...scope, status: response.status, error: points.length === 0 ? "no_points" : "kis_http_error", rawTextPreview: response.response.rawText.slice(0, 500) }); return; }
        results.push(derive(points, response.points[0]?.price ?? null, response.complete !== false, { httpStatus: response.status, rawPointCount: response.points.length, parsedPointCount: points.length, pageCount: response.pageCount ?? 1, endpoint: response.request.url, rawTextPreview: response.response.rawText.slice(0, 1000), cacheHit: false, ranking: { rank: scope.rank ?? null, changeRate: scope.changeRate ?? null, totalVolume: scope.rankingVolume ?? null, totalTradeValue: scope.rankingTradeValue ?? null }, cacheSource: "KIS_TOP100_RANKING_REUSED", sessionCoverage: { firstPointTime: points.at(-1)?.time ?? null, lastPointTime: points[0]?.time ?? null }, note: response.complete === false ? "KIS continuation cursor remained after page limit" : "all available intraday pages included" }, scope, sessionDate, policy, turnoverRatios.get(`${scope.market}:${scope.code}`) ?? null));
      } catch (error) { errors.push({ ...scope, error: error instanceof Error ? error.message : String(error) }); }
    }
  }
  await Promise.all(Array.from({ length: Math.min(options.concurrency ?? 2, Math.max(1, pending.length)) }, () => worker()));
  return { ok: errors.length === 0, checkedAt: new Date().toISOString(), sessionDate, marketScope: [...VWAP_MARKETS], universe: selected.universe, instrumentCount: scopes.length, watchlistCount: scopes.length, attemptedCount: pending.length, cacheHitCount: cache.size, kisRequestCount: pending.length, successCount: results.length, failureCount: errors.length, qualified: results.filter((row) => row.qualifies), results, errors };
}

let activeScan: Promise<Awaited<ReturnType<typeof executeUsVwapScan>>> | null = null;
export function scanUsVwap(options: { scopes?: Scope[]; universe?: Record<string, unknown>; concurrency?: number; cacheTtlMs?: number } = {}) {
  if (!activeScan) activeScan = executeUsVwapScan(options).finally(() => { activeScan = null; });
  return activeScan;
}

export async function persistAndScanUsVwap() {
  const selected = await watchlistScopes(); const result = await scanUsVwap(selected); const db = getDb();
  if (db) for (const row of result.results) await db.insert(usIntradayVwapSnapshots).values({ market: row.market, code: row.code, sessionDate: row.sessionDate, vwap: row.vwap, currentPrice: row.currentPrice, totalVolume: row.totalVolume, totalTradeValue: row.totalTradeValue, pointCount: row.pointCount, complete: row.complete, diagnostics: row.diagnostics }).onConflictDoUpdate({ target: [usIntradayVwapSnapshots.market, usIntradayVwapSnapshots.code, usIntradayVwapSnapshots.sessionDate], set: { vwap: row.vwap, currentPrice: row.currentPrice, totalVolume: row.totalVolume, totalTradeValue: row.totalTradeValue, pointCount: row.pointCount, complete: row.complete, diagnostics: row.diagnostics, observedAt: new Date() } });
  return result;
}

export async function runUsVwapAutomation() {
  const result = await persistAndScanUsVwap();
  const webhook = process.env.US_VWAP_DISCORD_WEBHOOK_URL?.trim() || "";
  let discord: Record<string, unknown> = { configured: Boolean(webhook), sent: 0 };
  if (webhook && result.qualified.length) {
    const db = getDb();
    const items = [] as any[];
    for (const row of result.qualified) {
      if (db) { const existing = await db.select({ id: usIntradayVwapAlerts.id }).from(usIntradayVwapAlerts).where(and(eq(usIntradayVwapAlerts.market, row.market), eq(usIntradayVwapAlerts.code, row.code), eq(usIntradayVwapAlerts.sessionDate, row.sessionDate))).limit(1); if (existing.length) continue; }
      items.push({ market: row.market, rank: 0, code: row.code, name: row.name ?? "", price: String(row.currentPrice ?? ""), changeRate: "", marketCap: 0, tradingValue: row.totalTradeValue, turnoverRatio: 0, openToHighRate: 0, vwap: row.vwap } as any);
    }
    if (!items.length) return { ...result, discord: { configured: true, sent: 0, deduplicated: result.qualified.length } };
    const sent = await sendUsTurnoverRatioToDiscord(items, webhook);
    if (db && sent?.ok) for (const row of result.qualified.filter((candidate) => items.some((item) => item.market === candidate.market && item.code === candidate.code))) await db.insert(usIntradayVwapAlerts).values({ market: row.market, code: row.code, sessionDate: row.sessionDate }).onConflictDoNothing();
    discord = { configured: true, sent: sent?.ok ? items.length : 0, status: sent?.status ?? 0 };
  }
  return { ...result, discord };
}

export async function vwapSettings() { return { module: await loadFeatureModuleSettings("us-vwap"), filters: await loadUsTurnoverFilterSettings() }; }
