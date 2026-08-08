import { and, asc, eq, or } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { usInstruments, usTurnoverWatchlist, usTurnoverWatchlistAlertState, usTurnoverRatioSnapshotAttempts } from "@/lib/schema";
import { ensureUsInstrument } from "@/lib/us-instruments";
import { fetchKisUsPriceDetail, getKisUsPriceDetailOutput } from "@/lib/kis-us-price-detail";
import { calculateKisUsMarketCap } from "@/lib/kis-us-market-cap";
import { loadUsTurnoverFilterSettings, type UsTurnoverFilterSettings } from "@/lib/us-turnover-settings";
import { explainUsTurnoverFilters } from "@/lib/us-turnover-filter-explanation";
import { saveAndCalculateUsTurnoverRatioTrends } from "@/lib/us-turnover-ratio-trend";
import { sendUsTurnoverRatioToDiscord } from "@/lib/discord-us-turnover-ratio";
import { loadFeatureModuleSettings } from "@/lib/feature-module-settings";
import { loadFeatureDiscordWebhook } from "@/lib/discord-config";

type WatchItem = { instrumentId: number; market: string; code: string; name: string };
export type WatchlistScanResult = {
  ok: boolean; checkedAt: string; watchlistCount: number; attempted: number; detailSuccessCount: number; detailFailureCount: number;
  qualified: ReturnType<typeof explainUsTurnoverFilters> extends infer _T ? Array<Record<string, unknown>> : never;
  steps: Array<{ step: string; count: number; detail?: string }>;
  results: Array<Record<string, unknown>>; settings: UsTurnoverFilterSettings; errors: Array<Record<string, unknown>>;
};

async function loadWatchlist(): Promise<WatchItem[]> {
  const db = getDb();
  if (!db) return [];
  return db.select({ instrumentId: usInstruments.id, market: usInstruments.market, code: usInstruments.code, name: usInstruments.name })
    .from(usTurnoverWatchlist).innerJoin(usInstruments, eq(usInstruments.id, usTurnoverWatchlist.instrumentId))
    .where(and(eq(usTurnoverWatchlist.enabled, true), or(eq(usInstruments.manualProductAction, "ALLOW"), and(eq(usInstruments.isEtf, false), eq(usInstruments.isLeveraged, false), eq(usInstruments.isInverse, false), eq(usInstruments.isDerivativeProduct, false), eq(usInstruments.instrumentType, "COMMON_STOCK"))))).orderBy(asc(usInstruments.market), asc(usInstruments.code));
}

async function rebindWatchlistInstrument(oldInstrumentId: number, market: string, code: string, name: string) {
  const db = getDb();
  if (!db) return null;
  const newInstrumentId = await ensureUsInstrument({ market, code, name });
  if (newInstrumentId === null || newInstrumentId === oldInstrumentId) return newInstrumentId;
  await db.transaction(async (tx) => {
    await tx.update(usTurnoverWatchlist).set({ enabled: false, updatedAt: new Date() }).where(eq(usTurnoverWatchlist.instrumentId, oldInstrumentId));
    await tx.insert(usTurnoverWatchlist).values({ instrumentId: newInstrumentId, enabled: true, updatedAt: new Date() })
      .onConflictDoUpdate({ target: usTurnoverWatchlist.instrumentId, set: { enabled: true, updatedAt: new Date() } });
  });
  return newInstrumentId;
}

function fingerprint(row: Record<string, unknown>) {
  return [row.market, row.code, Number(row.price ?? 0).toFixed(6), Number(row.rate ?? 0).toFixed(4), Number(row.tradingValue ?? 0).toFixed(2), Number(row.turnoverRatio ?? 0).toFixed(4)].join("|");
}

function num(value: unknown) { const n = Number(String(value ?? "").replace(/,/g, "").replace(/%/g, "")); return Number.isFinite(n) ? n : null; }

export async function scanUsTurnoverWatchlist(options: { send?: boolean } = {}): Promise<WatchlistScanResult> {
  const checkedAt = new Date().toISOString();
  const settings = await loadUsTurnoverFilterSettings();
  const moduleSettings = await loadFeatureModuleSettings("us-turnover-ratio");
  const watchlist = await loadWatchlist();
  const steps: WatchlistScanResult["steps"] = [{ step: "활성 관심종목 DB 조회", count: watchlist.length }];
  const results: Array<Record<string, unknown>> = [];
  const errors: Array<Record<string, unknown>> = [];
  const resolvedInstruments = new Map<number, number>();
  for (const item of watchlist) {
    const markets = [...new Set([item.market, "NAS", "NYS", "AMS"].map((market) => market.toUpperCase()))];
    let detail = null;
    let resolvedMarket = item.market;
    const attempts: Array<Record<string, unknown>> = [];
    for (const market of markets) {
      const candidate = await fetchKisUsPriceDetail({ market: market as "NAS" | "AMS" | "NYS", code: item.code });
      const candidateOutput = getKisUsPriceDetailOutput(candidate?.parsed);
      const valid = Boolean(candidate?.ok && candidateOutput && candidateOutput.last && (candidateOutput.t_xrat ?? candidateOutput.rate) !== undefined && (candidateOutput.tamt ?? candidateOutput.tamnt) !== undefined);
      attempts.push({ market, ok: valid, status: candidate?.status ?? 0 });
      if (valid) { detail = candidate; resolvedMarket = market; break; }
    }
    if (resolvedMarket !== item.market && detail?.ok) {
      const reboundId = await rebindWatchlistInstrument(item.instrumentId, resolvedMarket, item.code, item.name);
      if (reboundId !== null) resolvedInstruments.set(item.instrumentId, reboundId);
    }
    const db = getDb();
    if (db) {
      const resolvedId = resolvedInstruments.get(item.instrumentId) ?? item.instrumentId;
      await db.insert(usTurnoverRatioSnapshotAttempts).values(attempts.map((attempt) => ({
        market: String(attempt.market), code: item.code, name: item.name, instrumentType: "COMMON_STOCK",
        snapshotStatus: attempt.ok ? "WATCHLIST_DETAIL_SUCCESS" : "WATCHLIST_MARKET_RETRY_FAILED",
        errorMessage: attempt.ok ? null : "KIS 상세 응답 누락 또는 필수 필드 부족", observedAt: new Date(), instrumentId: resolvedId,
      })));
    }
    const output = getKisUsPriceDetailOutput(detail?.parsed);
    const marketCap = calculateKisUsMarketCap(output);
    const tradingValue = num(output.tamt ?? output.tamnt);
    const price = num(output.last);
    const rate = num(output.t_xrat);
    const open = num(output.open); const high = num(output.high);
    const openToHighRate = open && high ? ((high - open) / open) * 100 : null;
    const base = { instrumentId: resolvedInstruments.get(item.instrumentId) ?? item.instrumentId, market: resolvedMarket, code: item.code, name: item.name, price, rate, marketCap, tradingValue, turnoverRatio: marketCap && tradingValue ? tradingValue / marketCap * 100 : null, openToHighRate, detailOk: Boolean(detail?.ok), status: detail?.status ?? 0, attempts, raw: detail?.parsed ?? null };
    if (!detail?.ok || marketCap == null || tradingValue == null || price == null || rate == null || openToHighRate == null) {
      errors.push({ ...base, error: "상세 시세 또는 필수 필드 누락" }); results.push({ ...base, qualifies: false, failedFilters: ["상세 시세/필수 필드"] }); continue;
    }
    const explanation = explainUsTurnoverFilters({ market: item.market, rank: 0, code: item.code, name: item.name, price: String(price), changeRate: String(rate), marketCap, tradingValue, turnoverRatio: base.turnoverRatio as number, openToHighRate }, settings);
    results.push({ ...base, qualifies: explanation.passed, passedFilters: explanation.passedFilters, failedFilters: explanation.failedFilters });
  }
  const qualified = results.filter((row) => row.qualifies);
  steps.push({ step: "KIS 상세 시세 조회 시도", count: watchlist.length });
  steps.push({ step: "KIS 상세 시세 조회 성공", count: results.filter((row) => row.detailOk).length });
  steps.push({ step: "필터 판정 완료", count: results.length });
  steps.push({ step: "최종 유효 후보", count: qualified.length });
  let alertCandidates = qualified;
  let suppressedCount = 0;
  if (options.send && qualified.length) {
    const db = getDb();
    if (db) {
      const now = Date.now();
      const eligible: Array<Record<string, unknown>> = [];
      for (const row of qualified) {
        const instrumentId = Number(row.instrumentId);
        const state = (await db.select().from(usTurnoverWatchlistAlertState).where(eq(usTurnoverWatchlistAlertState.instrumentId, instrumentId)).limit(1))[0];
        const same = state?.lastFingerprint === fingerprint(row);
        const cooling = state?.lastSentAt && now - state.lastSentAt.getTime() < moduleSettings.cooldownSeconds * 1000;
        if (same || cooling) { suppressedCount += 1; continue; }
        eligible.push(row);
      }
      alertCandidates = eligible;
    }
  }
  steps.push({ step: "중복·쿨다운 제외", count: suppressedCount });
  if (options.send && alertCandidates.length) {
    const webhook = await loadFeatureDiscordWebhook("us-turnover-ratio", ["US_TURNOVER_RATIO_WATCHLIST_DISCORD_WEBHOOK_URL", "US_TURNOVER_WATCH_DISCORD_WEBHOOK_URL", "US_TURNOVER_RATIO_INCREASE_DISCORD_WEBHOOK_URL"]);
    if (!webhook) errors.push({ error: "US_TURNOVER_RATIO_WATCHLIST_DISCORD_WEBHOOK_URL 미설정" });
    else {
      const payloadItems = alertCandidates.map((row) => ({ ...row, rank: 0, changeRate: String(row.rate ?? ""), openToHighRate: Number(row.openToHighRate ?? 0) })) as any;
      const sent = await sendUsTurnoverRatioToDiscord(payloadItems, webhook);
      steps.push({ step: "Discord 전송", count: sent?.ok ? alertCandidates.length : 0, detail: sent?.ok ? "성공" : `실패 HTTP ${sent?.status ?? 0}` });
      if (sent?.ok) {
        const db = getDb();
        if (db) for (const row of alertCandidates) await db.insert(usTurnoverWatchlistAlertState).values({ instrumentId: Number(row.instrumentId), lastSentAt: new Date(), lastFingerprint: fingerprint(row), updatedAt: new Date() }).onConflictDoUpdate({ target: usTurnoverWatchlistAlertState.instrumentId, set: { lastSentAt: new Date(), lastFingerprint: fingerprint(row), updatedAt: new Date() } });
      }
    }
  }
  return { ok: errors.length === 0, checkedAt, watchlistCount: watchlist.length, attempted: watchlist.length, detailSuccessCount: results.filter((row) => row.detailOk).length, detailFailureCount: errors.length, qualified, steps, results, settings, errors };
}
