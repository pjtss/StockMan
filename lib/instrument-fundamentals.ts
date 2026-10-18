import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { instrumentFundamentalHistory, instrumentFundamentalSnapshots, krCommonStockUniverse, usCommonStockUniverse } from "@/lib/schema";
import { fetchKrPriceDetail } from "@/lib/kis-kr-price-detail";
import { fetchKisUsPriceDetail, getKisUsPriceDetailOutput } from "@/lib/kis-us-price-detail";
import { withAutomationLock } from "@/lib/automation-lock";
import { safeErrorMetadata } from "@/lib/error-diagnostics";
import { beginFundamentalRefresh, finishFundamentalRefresh, markFundamentalBatchInTransaction } from "@/lib/instrument-fundamental-progress";

const BATCH_SIZE = 200;
const WORKER_COUNT = 8;
const DB_WRITE_ATTEMPTS = 3;
type FundamentalRow = typeof instrumentFundamentalSnapshots.$inferInsert;

export function parseNullableFundamentalNumber(value: unknown): number | null {
  if (value == null || String(value).trim() === "") return null;
  const parsed = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

export function isEligibleFundamentalInstrument(item: {
  market: string; enabled?: boolean; instrumentType?: string;
  isEtp?: boolean; isWarrant?: boolean; isPreferred?: boolean; isSuspended?: boolean;
  isDerivative?: boolean; isDr?: boolean; isLeveraged?: boolean; isInverse?: boolean;
}) {
  if (item.enabled !== true || item.instrumentType !== "COMMON_STOCK") return false;
  if (item.market === "KOSPI" || item.market === "KOSDAQ" || item.market === "KRX") {
    return !item.isEtp && !item.isWarrant && !item.isPreferred && !item.isSuspended;
  }
  if (item.market === "NAS" || item.market === "NYS" || item.market === "AMS") {
    return !item.isEtp && !item.isWarrant && !item.isDerivative && !item.isDr && !item.isLeveraged && !item.isInverse;
  }
  return false;
}

async function executeInstrumentFundamentalsRefresh() {
  const db = getDb(); const startedAt = new Date();
  const [kr, us] = await Promise.all([
    db.select({ market: krCommonStockUniverse.market, code: krCommonStockUniverse.code, name: krCommonStockUniverse.name, enabled: krCommonStockUniverse.enabled, instrumentType: krCommonStockUniverse.instrumentType, isEtp: krCommonStockUniverse.isEtp, isWarrant: krCommonStockUniverse.isWarrant, isPreferred: krCommonStockUniverse.isPreferred, isSuspended: krCommonStockUniverse.isSuspended }).from(krCommonStockUniverse).where(and(eq(krCommonStockUniverse.enabled, true), eq(krCommonStockUniverse.instrumentType, "COMMON_STOCK"), eq(krCommonStockUniverse.isEtp, false), eq(krCommonStockUniverse.isWarrant, false), eq(krCommonStockUniverse.isPreferred, false), eq(krCommonStockUniverse.isSuspended, false))),
    db.select({ market: usCommonStockUniverse.market, code: usCommonStockUniverse.code, name: usCommonStockUniverse.name, enabled: usCommonStockUniverse.enabled, instrumentType: usCommonStockUniverse.instrumentType, isEtp: usCommonStockUniverse.isEtf, isWarrant: usCommonStockUniverse.isWarrant, isDerivative: usCommonStockUniverse.isDerivative, isDr: usCommonStockUniverse.isDr, isLeveraged: usCommonStockUniverse.isLeveraged, isInverse: usCommonStockUniverse.isInverse }).from(usCommonStockUniverse).where(and(eq(usCommonStockUniverse.enabled, true), eq(usCommonStockUniverse.instrumentType, "COMMON_STOCK"), eq(usCommonStockUniverse.isEtf, false), eq(usCommonStockUniverse.isWarrant, false), eq(usCommonStockUniverse.isDerivative, false), eq(usCommonStockUniverse.isDr, false), eq(usCommonStockUniverse.isLeveraged, false), eq(usCommonStockUniverse.isInverse, false))),
  ]);
  const instruments = [...kr, ...us].filter(isEligibleFundamentalInstrument);
  const progress = await beginFundamentalRefresh(instruments);
  const pendingInstruments = progress.instruments;
  if (!pendingInstruments.length && progress.deferredRetryCount > 0) {
    const progressResult = await finishFundamentalRefresh(progress.jobId);
    return {
      ok: true,
      skipped: true,
      reason: "instrument_retry_backoff",
      nextRetryAt: progress.nextRetryAt,
      instrumentCount: instruments.length,
      attemptedCount: 0,
      successCount: 0,
      failureCount: 0,
      unattemptedCount: 0,
      progress: { jobId: progress.jobId, resumed: progress.resumed, skippedCompletedCount: progress.skippedCompletedCount, deferredRetryCount: progress.deferredRetryCount, nextRetryAt: progress.nextRetryAt, status: progressResult.status, cumulativeSuccessCount: progressResult.successCount, cumulativeFailureCount: progressResult.failedCount, pendingCount: progressResult.pendingCount },
    };
  }
  const failures: Array<{ market: string; code: string; error: string }> = [];
  let successCount = 0;
  let attemptedCount = 0;
  let providerDurationMs = 0;
  let databaseDurationMs = 0;
  let batchCount = 0;
  let databaseFailure: { errorCode: string; databaseCode?: string } | null = null;

  const persistBatch = async (batch: FundamentalRow[], batchFailures: Array<{ market: string; code: string; error: string }>) => {
    const now = new Date();
    let lastError: unknown;
    for (let attempt = 1; attempt <= DB_WRITE_ATTEMPTS; attempt++) {
      const writeStartedAt = Date.now();
      try {
        await db.transaction(async (tx) => {
          if (batch.length) {
            await tx.insert(instrumentFundamentalHistory).values(batch.map((row) => ({ ...row, observedAt: now, fetchedAt: now }))).onConflictDoNothing({ target: [instrumentFundamentalHistory.market, instrumentFundamentalHistory.code, instrumentFundamentalHistory.observedAt] });
            await tx.insert(instrumentFundamentalSnapshots).values(batch.map((row) => ({ ...row, observedAt: now, fetchedAt: now }))).onConflictDoUpdate({ target: [instrumentFundamentalSnapshots.market, instrumentFundamentalSnapshots.code], set: {
            name: sql`excluded.name`, price: sql`excluded.price`, changeRate: sql`COALESCE(excluded.change_rate, ${instrumentFundamentalSnapshots.changeRate})`, open: sql`COALESCE(excluded.open, ${instrumentFundamentalSnapshots.open})`, high: sql`COALESCE(excluded.high, ${instrumentFundamentalSnapshots.high})`, low: sql`COALESCE(excluded.low, ${instrumentFundamentalSnapshots.low})`, volume: sql`COALESCE(excluded.volume, ${instrumentFundamentalSnapshots.volume})`, tradingValue: sql`COALESCE(excluded.trading_value, ${instrumentFundamentalSnapshots.tradingValue})`, marketCap: sql`COALESCE(excluded.market_cap, ${instrumentFundamentalSnapshots.marketCap})`, sharesOutstanding: sql`COALESCE(excluded.shares_outstanding, ${instrumentFundamentalSnapshots.sharesOutstanding})`, currency: sql`COALESCE(excluded.currency, ${instrumentFundamentalSnapshots.currency})`, source: sql`excluded.source`, rawPayload: sql`excluded.raw_payload`, observedAt: now, fetchedAt: now,
          } });
          }
          await markFundamentalBatchInTransaction(tx, progress.jobId,
            batch.map(({ market, code, name }) => ({ market, code, name: String(name ?? "") })),
            batchFailures.map(({ market, code, error }) => ({ market, code, name: "", errorCode: error })),
          );
        });
        databaseDurationMs += Date.now() - writeStartedAt;
        batchCount++;
        successCount += batch.length;
        for (const market of new Set(batch.map((row) => String(row.market)))) {
          marketSummary[market] ??= { eligibleCount: 0, attemptedCount: 0, successCount: 0, failureCount: 0 };
          marketSummary[market].successCount += batch.filter((row) => row.market === market).length;
        }
        return true;
      } catch (error) {
        databaseDurationMs += Date.now() - writeStartedAt;
        lastError = error;
        if (attempt < DB_WRITE_ATTEMPTS) await new Promise((resolve) => setTimeout(resolve, attempt * 250));
      }
    }
    databaseFailure = safeErrorMetadata(lastError);
    failures.push({ market: "DB", code: "fundamental-batch", error: databaseFailure.errorCode });
    return false;
  };

  const marketSummary: Record<string, { eligibleCount: number; attemptedCount: number; successCount: number; failureCount: number }> = {};
  for (const item of instruments) {
    marketSummary[item.market] ??= { eligibleCount: 0, attemptedCount: 0, successCount: 0, failureCount: 0 };
    marketSummary[item.market].eligibleCount++;
  }

  for (let offset = 0; offset < pendingInstruments.length; offset += BATCH_SIZE) {
    if (databaseFailure) break;
    const candidates = pendingInstruments.slice(offset, offset + BATCH_SIZE);
    const fetchedRows: FundamentalRow[] = [];
    const batchFailures: Array<{ market: string; code: string; error: string }> = [];
    let cursor = 0;
    const fetchWorker = async () => {
      while (true) {
        const item = candidates[cursor++];
        if (!item) return;
        attemptedCount++;
        marketSummary[item.market].attemptedCount++;
        const providerStartedAt = Date.now();
        try {
          let data: Record<string, any>;
          let source: string;
          if (item.market === "KOSPI" || item.market === "KOSDAQ" || item.market === "KRX") {
            data = await fetchKrPriceDetail(item.code) ?? {};
            source = "KIS_DOMESTIC_PRICE";
          } else {
            const response = await fetchKisUsPriceDetail({ code: item.code, market: item.market });
            const parsed = response?.parsed as { rt_cd?: unknown } | null;
            if (!response?.ok || response.stale || Number(parsed?.rt_cd) !== 0) throw new Error("KIS_RESPONSE_NOT_FRESH_SUCCESS");
            const output = getKisUsPriceDetailOutput(response.parsed);
            data = { ok: true, status: response.status, price: parseNullableFundamentalNumber(output.last ?? output.t_prpr ?? output.price), changeRate: parseNullableFundamentalNumber(output.t_xrat ?? output.prdy_ctrt), volume: parseNullableFundamentalNumber(output.tvol ?? output.pvol ?? output.vol), tradingValue: parseNullableFundamentalNumber(output.tamt ?? output.tamnt), marketCap: parseNullableFundamentalNumber(output.tomv), sharesOutstanding: parseNullableFundamentalNumber(output.shar ?? output.shares ?? output.lstn_stcn), currency: String(output.crcy ?? output.currency ?? "USD"), raw: response.parsed };
            source = "KIS_OVERSEAS_PRICE";
          }
          if (!data.ok || !Number.isFinite(data.price) || data.price <= 0) throw new Error("KIS_PRICE_OR_STATUS_INVALID");
          const marketCap = Number.isFinite(data.marketCap) && data.marketCap > 0 ? data.marketCap : null;
          if (marketCap === null) throw new Error("KIS_MARKET_CAP_MISSING_OR_INVALID");
          const volume = Number.isFinite(data.volume) && data.volume >= 0 ? data.volume : null;
          const tradingValue = Number.isFinite(data.tradingValue) && data.tradingValue >= 0 ? data.tradingValue : null;
          const sharesOutstanding = Number.isFinite(data.sharesOutstanding) && data.sharesOutstanding > 0 ? data.sharesOutstanding : null;
          const currency = String(data.currency ?? "").trim() || (item.market === "KOSPI" || item.market === "KOSDAQ" || item.market === "KRX" ? "KRW" : "USD");
          fetchedRows.push({ market: item.market, code: item.code, name: item.name, price: data.price, changeRate: data.changeRate, open: data.open ?? null, high: data.high ?? null, low: data.low ?? null, volume, tradingValue, marketCap, sharesOutstanding, currency, source, rawPayload: JSON.stringify(data.raw ?? data.parsed ?? data) });
        } catch (error) {
          const message = error instanceof Error ? error.message : "";
          const errorCode = /^KIS_[A-Z0-9_]+$/.test(message) ? message : safeErrorMetadata(error).errorCode;
          failures.push({ market: item.market, code: item.code, error: errorCode });
          batchFailures.push({ market: item.market, code: item.code, error: errorCode });
          marketSummary[item.market].failureCount++;
        } finally {
          providerDurationMs += Date.now() - providerStartedAt;
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(WORKER_COUNT, candidates.length) }, fetchWorker));
    if (!(await persistBatch(fetchedRows, batchFailures))) break;
  }

  const unattemptedCount = pendingInstruments.length - attemptedCount;
  const providerFailureCount = failures.filter((failure) => failure.market !== "DB").length;
  const failureCount = providerFailureCount + (databaseFailure ? pendingInstruments.length - successCount - providerFailureCount : 0);
  const progressResult = await finishFundamentalRefresh(progress.jobId);
  const completedAt = new Date();
  return { ok: progressResult.status === "SUCCESS", startedAt: startedAt.toISOString(), completedAt: completedAt.toISOString(), durationMs: completedAt.getTime() - startedAt.getTime(), instrumentCount: instruments.length, attemptedCount, successCount, failureCount, unattemptedCount, batchCount, providerDurationMs, databaseDurationMs, databaseFailure, marketSummary, failures: failures.slice(0, 100), progress: { jobId: progress.jobId, resumed: progress.resumed, skippedCompletedCount: progress.skippedCompletedCount, deferredRetryCount: progress.deferredRetryCount, nextRetryAt: progress.nextRetryAt, status: progressResult.status, cumulativeSuccessCount: progressResult.successCount, cumulativeFailureCount: progressResult.failedCount, pendingCount: progressResult.pendingCount } };
}

export function refreshInstrumentFundamentals() {
  return withAutomationLock("instrument-fundamentals-refresh", async () => executeInstrumentFundamentalsRefresh())
    .then((result) => result ?? { ok: true, skipped: true, reason: "already_running" });
}
