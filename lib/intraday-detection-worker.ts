import { intradayMemoryState } from "@/lib/intraday-memory-state";
import { loadUsTopRisingScopes } from "@/lib/us-top-rising-universe";
import crypto from "node:crypto";
import { recordIntradayTick, recordIntradayTransitions, type IntradayTransition } from "@/lib/intraday-detection-observability";
import { fetchUsMinuteTurnover } from "@/lib/kis-us-minute-turnover";
import { evaluateIntradayQuality } from "@/lib/intraday-quality-gate";
import { getAccessToken } from "@/lib/kis-token";
import { fetchDomesticFluctuation } from "@/lib/kis-domestic-api";
import { fetchKrMinuteCandles } from "@/lib/kr-minute-candle-cache";
import { isDomesticScannerOpen, isUsScannerOpen } from "@/lib/scanner-hours";
import { scoreIntradayCandidate } from "@/lib/intraday-candidate-priority";
import { loadIntradayMvpPolicy } from "@/lib/intraday-mvp-policy";
import { sendIntradayMvpAlerts, type IntradayMvpAlert } from "@/lib/discord-intraday-mvp";

export type IntradayWorkerStatus = "STOPPED" | "RUNNING" | "WARMING_UP" | "STOPPING" | "DEGRADED";
export type IntradayWorkerSnapshot = { status: IntradayWorkerStatus; startedAt: number | null; lastTickAt: number | null; lastError: string | null; tickCount: number };

export function orderIntradayPoints<T extends { date?: string; time?: string }>(points: T[]) {
  return [...points].sort((a, b) => `${a.date ?? ""}${a.time ?? ""}`.localeCompare(`${b.date ?? ""}${b.time ?? ""}`));
}

export function intradaySessionDate(market: string, at: number) {
  const timeZone = ["NAS", "AMS", "NYS"].includes(market.toUpperCase()) ? "America/New_York" : "Asia/Seoul";
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(at));
}

const globalKey = "__stockman_intraday_worker__";
type Runtime = { status: IntradayWorkerStatus; startedAt: number | null; lastTickAt: number | null; lastError: string | null; tickCount: number; timer: ReturnType<typeof setInterval> | null; running: Promise<void> | null };
const globalStore = globalThis as typeof globalThis & { [globalKey]?: Runtime };
const runtime = globalStore[globalKey] ?? (globalStore[globalKey] = { status: "STOPPED", startedAt: null, lastTickAt: null, lastError: null, tickCount: 0, timer: null, running: null });
const workerRunId = (globalStore as any).__stockman_intraday_run_id__ ?? ((globalStore as any).__stockman_intraday_run_id__ = crypto.randomUUID());

export function getIntradayWorkerSnapshot(): IntradayWorkerSnapshot { const { status, startedAt, lastTickAt, lastError, tickCount } = runtime; return { status, startedAt, lastTickAt, lastError, tickCount }; }

export async function runIntradayTick(now = Date.now()) {
  if (runtime.running) return runtime.running;
  runtime.running = (async () => {
    try {
      runtime.status = "WARMING_UP";
      const started = Date.now();
      const tickId = crypto.randomUUID();
      const policy = await loadIntradayMvpPolicy();
      // Keep an explicit false value as the only disable switch. A missing
      // environment variable must not turn off production alerts silently.
      if (process.env.INTRADAY_DETECTION_ENABLED === "false") { runtime.status = "STOPPED"; return; }
      const [domesticOpen, usOpen] = await Promise.all([isDomesticScannerOpen(new Date(now)), isUsScannerOpen(new Date(now))]);
      // The market feeds are independent. Fetch them concurrently so a slow
      // exchange does not delay the other market's candidate refresh.
      const [scopes, domestic] = await Promise.all([
        usOpen ? loadUsTopRisingScopes() : Promise.resolve({ scopes: [], universe: { markets: [] } as any }),
        domesticOpen ? loadDomesticTopRising().catch(() => []) : Promise.resolve([]),
      ]);
      if (scopes.scopes.length || domestic.length) intradayMemoryState.rotateSnapshot([...scopes.scopes.map((item) => ({ market: item.market, code: item.code, name: item.name, rank: item.rank, rate: item.changeRate ?? undefined, volume: item.rankingVolume ?? undefined, tradingValue: item.rankingTradeValue ?? undefined })), ...domestic]);
      for (const item of domestic) {
        const scored = scoreIntradayCandidate({ market: item.market, code: item.code, currency: "KRW", marketCap: item.marketCap, tradingValue: item.tradingValue, isTopRising: true, isNewEntry: false, rankChange: 0, rateChange: 0, volumeChange: 0, aboveVwap: false, now });
        intradayMemoryState.upsertCandidate({ ...(scored ?? item), mvpTracking: true } as any);
      }
      // The MVP owns the full 300-symbol TOP100 union. The shared KIS
      // throttle serializes requests at the configured safe rate, so limiting
      // this batch to 20 would leave candidates waiting several minutes and
      // violate the one-minute observation requirement.
      const due = intradayMemoryState.dueCandidates(now, 300).filter((candidate) => {
        const isUs = ["NAS", "AMS", "NYS"].includes(candidate.market);
        return !isUs || candidate.focusTracking;
      });
      let failedCount = 0;
      const transitions: IntradayTransition[] = [];
      const alerts: IntradayMvpAlert[] = [];
      await Promise.all(due.map(async (candidate) => {
        try {
          const isUs = ["NAS", "AMS", "NYS"].includes(candidate.market);
          if (isUs ? !usOpen : !domesticOpen) { intradayMemoryState.scheduleCandidate(candidate.market, candidate.code, now); return; }
          const result = isUs ? await fetchUsMinuteTurnover({ code: candidate.code, market: candidate.market as "NAS" | "AMS" | "NYS" }) : null;
          const points = isUs ? (result?.points ?? []) : await fetchKrMinuteCandles(candidate.code, 120, candidate.market);
          const valid = orderIntradayPoints(points.filter((point) => Number(point.price) > 0 && Number(point.volume ?? 0) >= 0) as any[]);
          const latest = valid.at(-1) as any;
          const volume = valid.reduce((sum, point) => sum + Number(point.volume ?? 0), 0);
          const tradingValue = valid.reduce((sum, point) => sum + Number(point.price ?? 0) * Number(point.volume ?? 0), 0);
          const vwap = volume > 0 ? tradingValue / volume : null;
          const sourceObservedAt = latest?.time ? (isUs ? Date.parse(String(latest.time)) : Date.parse(`${latest.date}T${String(latest.time).padStart(6, "0").replace(/(\d{2})(\d{2})(\d{2})/, "$1:$2:$3") }+09:00`)) : null;
          const sessionDate = intradaySessionDate(candidate.market, now);
          const quality = evaluateIntradayQuality({ sourceObservedAt: Number.isFinite(sourceObservedAt) ? sourceObservedAt : null, receivedAt: Date.now(), sessionId: sessionDate, currentPrice: latest?.price ?? null, volume, tradingValue, vwap, aboveVwap: latest?.price != null && vwap != null ? Number(latest.price) >= vwap : null }, candidate.consecutiveObservations ?? 0, now);
          intradayMemoryState.updateVwap(candidate.market, candidate.code, sessionDate, volume, tradingValue, sourceObservedAt || now);
          const latestPrice = Number(latest?.price ?? 0);
          const latestVolume = Number(latest?.volume);
          // Only an incremental minute volume is valid for the five-minute
          // MVP window. Cumulative amount/volume fields are intentionally not
          // used as a fallback because summing them creates false positives.
          const latestBarValue = Number.isFinite(latestVolume) && latestVolume >= 0 ? latestPrice * latestVolume : 0;
          const latestObservedAt = Number.isFinite(sourceObservedAt) && sourceObservedAt ? sourceObservedAt : now;
          const minuteBucket = Math.floor(latestObservedAt / 60_000) * 60_000;
          const turnover = intradayMemoryState.recordRollingTurnover(candidate.market, candidate.code, sessionDate, minuteBucket, Number.isFinite(latestBarValue) && latestBarValue >= 0 ? latestBarValue : 0, candidate.marketCap ?? 0, policy.windowMs, policy.threshold);
          const finalState = turnover.qualified && !["STALE", "DEGRADED", "WARMING_UP"].includes(quality.state) ? "QUALIFIED" : quality.state;
          const transition = intradayMemoryState.recordQuality(candidate.market, candidate.code, finalState, now, quality.dataAgeSeconds ?? undefined);
          if (transition?.previousState !== finalState) transitions.push({ tickId, market: candidate.market, code: candidate.code, fromState: transition?.previousState, toState: finalState, observedAt: new Date(now), dedupeKey: `${candidate.market}:${candidate.code}:${finalState}:${new Date(now).toISOString().slice(0, 16)}` });
          if (finalState === "QUALIFIED" && transition?.previousState !== "QUALIFIED" && turnover.ratio != null && candidate.marketCap) alerts.push({ market: candidate.market, code: candidate.code, marketCap: candidate.marketCap, rollingTradingValue: turnover.tradingValue, ratioPercent: turnover.ratio * 100, windowMinutes: policy.windowMinutes, observedAt: new Date(now).toISOString() });
          intradayMemoryState.scheduleCandidate(candidate.market, candidate.code, now);
        } catch { failedCount += 1; intradayMemoryState.scheduleCandidate(candidate.market, candidate.code, now); }
      }));
      runtime.lastTickAt = now;
      runtime.tickCount += 1;
      runtime.status = "RUNNING";
      runtime.lastError = null;
      await recordIntradayTick({ runId: workerRunId, tickId, workerStatus: runtime.status, plannedCount: scopes.scopes.length + domestic.length, executedCount: due.length - failedCount, deferredCount: Math.max(0, scopes.scopes.length + domestic.length - due.length), throttledCount: 0, failedCount, queueDepth: intradayMemoryState.dueCandidates(now).length, observedAt: new Date(now), durationMs: Date.now() - started });
      await recordIntradayTransitions(transitions);
      if (alerts.length) await sendIntradayMvpAlerts(alerts).catch((error) => { runtime.lastError = error instanceof Error ? `discord:${error.message}` : "discord:send_failed"; });
    } catch (error) {
      runtime.status = "DEGRADED";
      runtime.lastError = error instanceof Error ? error.message : String(error);
    } finally { runtime.running = null; }
  })();
  return runtime.running;
}

async function loadDomesticTopRising() {
  const token = await getAccessToken(); if (!token) return [];
  const rows = await fetchDomesticFluctuation(token);
  return rows.slice(0, 100).map((row: any, index) => {
    const market = String(row.rprs_mrkt_kor_name ?? "").includes("코스닥") ? "KOSDAQ" : "KOSPI";
    const code = String(row.mksc_shrn_iscd ?? row.stck_shrn_iscd ?? "").trim();
    const cap = Number(String(row.hts_avls ?? "").replace(/,/g, "")) * 100_000_000;
    const value = Number(String(row.acml_tr_pbmn ?? row.acml_tr_pbmn_amt ?? "").replace(/,/g, ""));
    return { market, code, priority: 10, lastSeenAt: Date.now(), lastCheckedAt: 0, nextCheckAt: Date.now(), consecutiveFailures: 0, marketCap: Number.isFinite(cap) && cap > 0 ? cap : null, tradingValue: Number.isFinite(value) ? value : null, isTopRising: true, rank: index + 1 } as any;
  }).filter((item) => item.code);
}

export function startIntradayDetectionWorker(intervalMs = 10_000) {
  if (runtime.timer || runtime.status === "RUNNING" || runtime.status === "WARMING_UP") return getIntradayWorkerSnapshot();
  runtime.status = "WARMING_UP"; runtime.startedAt = Date.now();
  void runIntradayTick();
  runtime.timer = setInterval(() => { void runIntradayTick(); }, Math.max(1_000, intervalMs));
  return getIntradayWorkerSnapshot();
}

export async function stopIntradayDetectionWorker() {
  runtime.status = "STOPPING";
  if (runtime.timer) { clearInterval(runtime.timer); runtime.timer = null; }
  if (runtime.running) await runtime.running;
  runtime.status = "STOPPED";
  return getIntradayWorkerSnapshot();
}

export function getIntradayMemoryState() { return intradayMemoryState.snapshot(); }
