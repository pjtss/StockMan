import { eq, and, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { usIntradayVwapSnapshots } from "@/lib/schema-vwap";
import { fetchUsMinuteTurnover } from "@/lib/kis-us-minute-turnover";
import { loadFeatureModuleSettings } from "@/lib/feature-module-settings";
import { loadUsTurnoverFilterSettings } from "@/lib/us-turnover-settings";
import { sendUsTurnoverRatioToDiscord } from "@/lib/discord-us-turnover-ratio";
import { usInstruments } from "@/lib/schema";
import { upsertUsTopRisingUniverse } from "@/lib/us-top-rising-universe";

export const VWAP_MARKETS = ["AMS", "NAS", "NYS"] as const;
type Scope = { market: string; code: string; name?: string };
type Row = Record<string, unknown>;
export type VwapResult = { market: string; code: string; name?: string; sessionDate: string; vwap: number | null; currentPrice: number | null; totalVolume: number; totalTradeValue: number; pointCount: number; complete: boolean; qualifies: boolean; diagnostics: Record<string, unknown> };

function dateKst() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date()).replaceAll("-", ""); }
function number(value: unknown) { const n = Number(String(value ?? "").replace(/,/g, "")); return Number.isFinite(n) ? n : null; }
async function watchlistScopes(): Promise<Scope[]> {
  const db = getDb(); if (!db) return [];
  const rows = await db.select({ market: usInstruments.market, code: usInstruments.code, name: usInstruments.name, instrumentType: usInstruments.instrumentType }).from(usInstruments).where(and(eq(usInstruments.enabled, true), inArray(usInstruments.market, [...VWAP_MARKETS])));
  return rows.filter((row) => row.instrumentType !== "ETF" && row.instrumentType !== "LEVERAGED" && !/ETF|ETN|인버스|레버리지|inverse|leverag|\bshort\b|\b\d+(?:\.\d+)?x\b/i.test(row.name)).map(({ market, code, name }) => ({ market, code, name }));
}

function derive(points: Array<{ price: number; volume: number; tradeValue: number }>, currentPrice: number | null, complete: boolean, diagnostics: Record<string, unknown>, scope: Scope, sessionDate: string): VwapResult {
  const totalVolume = points.reduce((sum, row) => sum + row.volume, 0); const totalTradeValue = points.reduce((sum, row) => sum + row.tradeValue, 0);
  const vwap = totalVolume > 0 ? totalTradeValue / totalVolume : null;
  return { ...scope, sessionDate, vwap, currentPrice, totalVolume, totalTradeValue, pointCount: points.length, complete, qualifies: vwap != null && currentPrice != null && currentPrice > vwap, diagnostics };
}

export async function scanUsVwap(options: { scopes?: Scope[] } = {}) {
  const sessionDate = dateKst(); const scopes = options.scopes ?? await watchlistScopes();
  const results: VwapResult[] = []; const errors: Array<Record<string, unknown>> = [];
  for (const scope of scopes) {
    try {
      const response = await fetchUsMinuteTurnover({ code: scope.code, market: scope.market });
      if (!response) throw new Error("KIS access token unavailable");
      const points = response.points.map((point: any) => { const raw = (point.raw ?? {}) as Row; const volume = number(raw.evol ?? raw.volume ?? raw.cntg_vol ?? raw.tvol) ?? 0; const tradeValue = number(raw.eamt ?? raw.trade_amount ?? raw.pbmn) ?? (point.price * volume); return { price: point.price, volume, tradeValue }; }).filter((point) => point.price > 0 && point.volume > 0);
      const result = derive(points, response.points[0]?.price ?? null, response.complete !== false, { httpStatus: response.status, rawPointCount: response.points.length, parsedPointCount: points.length, pageCount: response.pageCount ?? 1, endpoint: response.request.url, rawTextPreview: response.response.rawText.slice(0, 1000), note: response.complete === false ? "KIS continuation cursor remained after page limit" : "all available intraday pages included" }, scope, sessionDate);
      results.push(result);
    } catch (error) { errors.push({ ...scope, error: error instanceof Error ? error.message : String(error) }); }
  }
  return { ok: errors.length === 0, checkedAt: new Date().toISOString(), sessionDate, marketScope: [...VWAP_MARKETS], watchlistCount: scopes.length, attemptedCount: scopes.length, successCount: results.length, failureCount: errors.length, qualified: results.filter((row) => row.qualifies), results, errors };
}

export async function persistAndScanUsVwap() {
  const result = await scanUsVwap(); const db = getDb();
  if (db) for (const row of result.results) await db.insert(usIntradayVwapSnapshots).values({ market: row.market, code: row.code, sessionDate: row.sessionDate, vwap: row.vwap, currentPrice: row.currentPrice, totalVolume: row.totalVolume, totalTradeValue: row.totalTradeValue, pointCount: row.pointCount, complete: row.complete, diagnostics: row.diagnostics }).onConflictDoUpdate({ target: [usIntradayVwapSnapshots.market, usIntradayVwapSnapshots.code, usIntradayVwapSnapshots.sessionDate], set: { vwap: row.vwap, currentPrice: row.currentPrice, totalVolume: row.totalVolume, totalTradeValue: row.totalTradeValue, pointCount: row.pointCount, complete: row.complete, diagnostics: row.diagnostics, observedAt: new Date() } });
  return result;
}

export async function runUsVwapAutomation() {
  const universe = await upsertUsTopRisingUniverse();
  const result = await persistAndScanUsVwap();
  const webhook = process.env.US_VWAP_DISCORD_WEBHOOK_URL?.trim() || "";
  let discord: Record<string, unknown> = { configured: Boolean(webhook), sent: 0 };
  if (webhook && result.qualified.length) {
    const items = result.qualified.map((row) => ({ market: row.market, rank: 0, code: row.code, name: row.name ?? "", price: String(row.currentPrice ?? ""), changeRate: "", marketCap: 0, tradingValue: row.totalTradeValue, turnoverRatio: 0, openToHighRate: 0, vwap: row.vwap } as any));
    const sent = await sendUsTurnoverRatioToDiscord(items, webhook);
    discord = { configured: true, sent: sent?.ok ? items.length : 0, status: sent?.status ?? 0 };
  }
  return { ...result, universe, discord };
}

export async function vwapSettings() { return { module: await loadFeatureModuleSettings("us-turnover-ratio"), filters: await loadUsTurnoverFilterSettings() }; }
