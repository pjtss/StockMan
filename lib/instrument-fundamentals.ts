import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { instrumentFundamentalHistory, instrumentFundamentalSnapshots, krCommonStockUniverse, usCommonStockUniverse } from "@/lib/schema";
import { fetchKrPriceDetail } from "@/lib/kis-kr-price-detail";
import { fetchKisUsPriceDetail, getKisUsPriceDetailOutput, getKisUsPriceDetailPrice, getKisUsPriceDetailShares, getKisUsPriceDetailTradingValue } from "@/lib/kis-us-price-detail";
import { withAutomationLock } from "@/lib/automation-lock";
import { BoundedWriteQueue } from "@/lib/bounded-write-queue";
import { createInstrumentFundamentalFailureAggregator } from "@/lib/instrument-fundamental-failure-summary";
import { calculateKisUsMarketCap } from "@/lib/kis-us-market-cap";
import { safeErrorMetadata, safeProviderCode } from "@/lib/error-diagnostics";
import { beginFundamentalRefresh, finishFundamentalRefresh, markFundamentalBatchInTransaction } from "@/lib/instrument-fundamental-progress";

const FETCH_CONCURRENCY = 8;
const WRITE_BATCH_SIZE = 200;
const WRITE_QUEUE_CAPACITY = 2;
const MAX_FAILURE_SAMPLES = 100;

type Instrument = { market: string; code: string; name: string };
type FundamentalsRow = {
  market: string; code: string; name: string; price: number; marketCap: number | null; changeRate: number | null;
  open: number | null; high: number | null; low: number | null; volume: number | null;
  tradingValue: number | null; listedShares: number | null;
  currency: string; source: string; rawPayload: string;
};
type Failure = { market: string; code: string; error: string };
type Progress = {
  processedCount: number; instrumentCount: number; fetchedCount: number; savedCount: number; failureCount: number;
  elapsedMs: number; fetchDurationMs: number; dbWriteDurationMs: number; writeQueueWaitMs: number;
};
type RefreshOptions = {
  instruments?: Array<Pick<Instrument, "market" | "code">>;
  onProgress?: (progress: Progress) => void | Promise<void>;
};

function finiteNumber(value: unknown): number | null {
  if (value == null || String(value).trim() === "") return null;
  const parsed = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseNullableFundamentalNumber(value: unknown): number | null {
  if (value == null || String(value).trim() === "") return null;
  const parsed = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function firstPositiveFundamentalNumber(...values: unknown[]) {
  for (const value of values) { const parsed = parseNullableFundamentalNumber(value); if (parsed !== null && parsed > 0) return parsed; }
  return null;
}
function firstFiniteFundamentalNumber(...values: unknown[]) {
  for (const value of values) { const parsed = parseNullableFundamentalNumber(value); if (parsed !== null) return parsed; }
  return null;
}
function firstNonNegativeFundamentalNumber(...values: unknown[]) {
  for (const value of values) { const parsed = parseNullableFundamentalNumber(value); if (parsed !== null && parsed >= 0) return parsed; }
  return null;
}

function getErrorCode(error: string) {
  const direct = error.match(/^([A-Z][A-Z0-9_]{2,79})/)?.[1];
  if (direct && !direct.startsWith("KIS_EMPTY_OR_INVALID")) return direct;
  const match = error.match(/msg_cd=([A-Z0-9_]+)/);
  return match ? `KIS_BUSINESS_ERROR_${safeProviderCode(match[1]) ?? "UNKNOWN"}` : direct ?? "OTHER";
}

export function classifyFundamentalProviderFailure(input: { status: number; responseOk: boolean; stale?: boolean; rtCd?: unknown; messageCode?: unknown; price: unknown; marketCap: unknown; }) {
  if (input.stale) return "KIS_STALE_DATA";
  if (input.status < 200 || input.status >= 300) return `KIS_HTTP_STATUS_${input.status}`;
  if (input.rtCd != null && String(input.rtCd) !== "0") return `KIS_BUSINESS_ERROR_${safeProviderCode(input.messageCode) ?? "UNKNOWN"}`;
  if (!input.responseOk) return "KIS_RESPONSE_NOT_OK";
  const price = parseNullableFundamentalNumber(input.price);
  if (price === null || price <= 0) return "KIS_PRICE_INVALID";
  const marketCap = parseNullableFundamentalNumber(input.marketCap);
  if (marketCap === null || marketCap <= 0) return "KIS_MARKET_CAP_MISSING_OR_INVALID";
  return null;
}

export function isEligibleFundamentalInstrument(item: { market: string; enabled?: boolean; instrumentType?: string; isEtp?: boolean; isWarrant?: boolean; isPreferred?: boolean; isSuspended?: boolean; isDerivative?: boolean; isDr?: boolean; isLeveraged?: boolean; isInverse?: boolean; }) {
  if (item.enabled !== true || item.instrumentType !== "COMMON_STOCK") return false;
  if (["KOSPI", "KOSDAQ", "KRX"].includes(item.market)) return !item.isEtp && !item.isWarrant && !item.isPreferred && !item.isSuspended;
  if (["NAS", "NYS", "AMS"].includes(item.market)) return !item.isEtp && !item.isWarrant && !item.isDerivative && !item.isDr && !item.isLeveraged && !item.isInverse;
  return false;
}

function quoteResponseDiagnostics(status: unknown, raw: unknown) {
  const response = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const output = response.output && typeof response.output === "object"
    ? response.output as Record<string, unknown>
    : response.output1 && typeof response.output1 === "object"
      ? response.output1 as Record<string, unknown>
      : {};
  const clean = (value: unknown) => String(value ?? "").replace(/[\r\n\t]+/g, " ").trim().slice(0, 120);
  const parts = [
    Number.isFinite(Number(status)) ? `http=${Number(status)}` : "",
    clean(response.rt_cd ?? response.rtCd) ? `rt_cd=${clean(response.rt_cd ?? response.rtCd)}` : "",
    clean(response.msg_cd ?? response.msgCd) ? `msg_cd=${clean(response.msg_cd ?? response.msgCd)}` : "",
    clean(response.msg1 ?? response.msg ?? output.msg1) ? `msg=${clean(response.msg1 ?? response.msg ?? output.msg1)}` : "",
  ].filter(Boolean);
  return parts.length ? ` (${parts.join(", ")})` : "";
}

function quotePayloadDiagnostics(raw: unknown) {
  if (!raw || typeof raw !== "object") return "";
  const response = raw as Record<string, unknown>;
  const outputKey = ["output", "output1", "output2"].find((key) =>
    response[key] && typeof response[key] === "object" && !Array.isArray(response[key]),
  );
  if (!outputKey) return "";
  const output = response[outputKey] as Record<string, unknown>;
  const populatedFieldCount = Object.values(output).filter((value) => value != null && String(value).trim() !== "").length;
  const priceFields = ["last", "t_prpr", "price"].filter((key) => Object.hasOwn(output, key));
  const populatedPriceField = priceFields.some((key) => output[key] != null && String(output[key]).trim() !== "");
  return ` (quote_output=${outputKey}, populated_fields=${populatedFieldCount}/${Object.keys(output).length}, price_fields=${priceFields.join("|") || "none"}, price_populated=${populatedPriceField})`;
}

function quoteMarketCapPayloadDiagnostics(raw: unknown) {
  if (!raw || typeof raw !== "object") return "";
  const response = raw as Record<string, unknown>;
  const outputKey = ["output", "output1", "output2"].find((key) =>
    response[key] && typeof response[key] === "object" && !Array.isArray(response[key]),
  );
  if (!outputKey) return "";
  const output = response[outputKey] as Record<string, unknown>;
  const fields = ["tomv", "hts_avls", "market_cap"];
  const present = fields.filter((key) => Object.hasOwn(output, key));
  const positive = present.filter((key) => {
    const value = finiteNumber(output[key]);
    return value !== null && value > 0;
  });
  const ignoredFields = ["mcap", "shar"].filter((key) => Object.hasOwn(output, key));
  return ` (quote_output=${outputKey}, market_cap_fields=${present.join("|") || "none"}, market_cap_positive_fields=${positive.join("|") || "none"}, ignored_as_market_cap=${ignoredFields.join("|") || "none"})`;
}

function isDomesticMarket(market: string) {
  return market === "KOSPI" || market === "KOSDAQ" || market === "KRX";
}

function fundamentalsOutput(parsed: unknown): Record<string, unknown> {
  const source = parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  const outputs = [source.output, source.output1, source.output2].filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)));
  return outputs.find((item) => ["last", "t_prpr", "price", "tomv", "hts_avls", "market_cap"].some((key) => {
    const value = parseNullableFundamentalNumber(item[key]); return value !== null && value > 0;
  })) ?? outputs[0] ?? {};
}

function positiveFromRawOutputs(parsed: unknown, keys: string[]) {
  const source = parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  const outputs = [source.output, source.output1, source.output2].filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)));
  for (const output of outputs) {
    for (const key of keys) { const value = firstPositiveFundamentalNumber(output[key]); if (value !== null) return value; }
  }
  return null;
}

async function executeInstrumentFundamentalsRefresh(options: RefreshOptions = {}) {
  const db = getDb();
  if (!db) throw new Error("DATABASE_URL 환경변수가 설정되지 않았습니다.");

    const startedAt = new Date();
  const startedClock = performance.now();
  const [kr, us] = await Promise.all([
    db.select({ market: krCommonStockUniverse.market, code: krCommonStockUniverse.code, name: krCommonStockUniverse.name, enabled: krCommonStockUniverse.enabled, instrumentType: krCommonStockUniverse.instrumentType, isEtp: krCommonStockUniverse.isEtp, isWarrant: krCommonStockUniverse.isWarrant, isPreferred: krCommonStockUniverse.isPreferred, isSuspended: krCommonStockUniverse.isSuspended })
      .from(krCommonStockUniverse).where(and(eq(krCommonStockUniverse.enabled, true), eq(krCommonStockUniverse.instrumentType, "COMMON_STOCK"), eq(krCommonStockUniverse.isEtp, false), eq(krCommonStockUniverse.isWarrant, false), eq(krCommonStockUniverse.isPreferred, false), eq(krCommonStockUniverse.isSuspended, false))),
    db.select({ market: usCommonStockUniverse.market, code: usCommonStockUniverse.code, name: usCommonStockUniverse.name, enabled: usCommonStockUniverse.enabled, instrumentType: usCommonStockUniverse.instrumentType, isEtp: usCommonStockUniverse.isEtf, isWarrant: usCommonStockUniverse.isWarrant, isDerivative: usCommonStockUniverse.isDerivative, isDr: usCommonStockUniverse.isDr, isLeveraged: usCommonStockUniverse.isLeveraged, isInverse: usCommonStockUniverse.isInverse })
      .from(usCommonStockUniverse).where(and(eq(usCommonStockUniverse.enabled, true), eq(usCommonStockUniverse.instrumentType, "COMMON_STOCK"), eq(usCommonStockUniverse.isEtf, false), eq(usCommonStockUniverse.isWarrant, false), eq(usCommonStockUniverse.isDerivative, false), eq(usCommonStockUniverse.isDr, false), eq(usCommonStockUniverse.isLeveraged, false), eq(usCommonStockUniverse.isInverse, false))),
  ]);
  const allInstruments: Instrument[] = [...kr, ...us].filter((item) => isEligibleFundamentalInstrument(item)).map(({ market, code, name }) => ({ market, code, name }));
  let instruments = allInstruments;
  if (options.instruments) {
    const requested = new Map(options.instruments.map((item) => [`${item.market}:${item.code}`, item]));
    if (requested.size === 0) throw new Error("instrument refresh scope cannot be empty");
    const available = new Map(allInstruments.map((item) => [`${item.market}:${item.code}`, item]));
    const missingScopes = [...requested.keys()].filter((key) => !available.has(key));
    if (missingScopes.length > 0) {
      throw new Error(`instrument refresh scope contains unknown or disabled instruments: ${missingScopes.length}`);
    }
    instruments = [...requested.keys()].map((key) => available.get(key)!);
  }
  const progress = await beginFundamentalRefresh(instruments);
  const eligibleCount = instruments.length;
  const resumedSuccessCount = progress.skippedCompletedCount;
  instruments = progress.instruments;
  if (!instruments.length && progress.deferredRetryCount > 0) {
    const progressResult = await finishFundamentalRefresh(progress.jobId);
    return { ok: true, skipped: true, reason: "instrument_retry_backoff", nextRetryAt: progress.nextRetryAt, instrumentCount: eligibleCount, attemptedCount: 0, successCount: 0, failureCount: 0, unattemptedCount: 0, progress: { jobId: progress.jobId, resumed: progress.resumed, skippedCompletedCount: progress.skippedCompletedCount, deferredRetryCount: progress.deferredRetryCount, nextRetryAt: progress.nextRetryAt, status: progressResult.status, cumulativeSuccessCount: progressResult.successCount, cumulativeFailureCount: progressResult.failedCount, pendingCount: progressResult.pendingCount } };
  }
  const failures: Failure[] = [];
  let persistedFailureCount = 0;
  const failedInstrumentKeys = new Set<string>();
  const failureAggregator = createInstrumentFundamentalFailureAggregator();
  const failureCodeCounts: Record<string, number> = {};
  const failureCodeCountsByMarket: Record<string, Record<string, number>> = {};
  const marketCounts = new Map<string, { instrumentCount: number; fetchedCount: number; savedCount: number; failureCount: number; fetchDurationMs: number }>();
  for (const item of instruments) {
    const counts = marketCounts.get(item.market) ?? { instrumentCount: 0, fetchedCount: 0, savedCount: 0, failureCount: 0, fetchDurationMs: 0 };
    counts.instrumentCount += 1;
    marketCounts.set(item.market, counts);
  }

  let fetchedCount = 0;
  let savedCount = 0;
  let databaseFailure: { errorCode: string } | undefined;
  let failureCount = 0;
  let processedCount = 0;
  let fetchDurationMs = 0;
  let dbWriteDurationMs = 0;
  let writeQueueWaitMs = 0;
  const bufferedRows: FundamentalsRow[] = [];
  const bufferFailures: Failure[] = [];

  const addFailure = (item: Instrument, error: string) => {
    failureCount += 1;
    failedInstrumentKeys.add(`${item.market}:${item.code}`);
    const errorCode = getErrorCode(error);
    failureCodeCounts[errorCode] = (failureCodeCounts[errorCode] ?? 0) + 1;
    failureCodeCountsByMarket[item.market] ??= {};
    failureCodeCountsByMarket[item.market][errorCode] = (failureCodeCountsByMarket[item.market][errorCode] ?? 0) + 1;
    failureAggregator.record(item.market, errorCode);
    const counts = marketCounts.get(item.market);
    if (counts) counts.failureCount += 1;
    if (failures.length < MAX_FAILURE_SAMPLES) failures.push({ market: item.market, code: item.code, error: error.slice(0, 240) });
  };
  const emitProgress = async () => {
    if (!options.onProgress) return;
    try {
      await options.onProgress({
        processedCount, instrumentCount: instruments.length, fetchedCount, savedCount, failureCount,
        elapsedMs: Math.round(performance.now() - startedClock), fetchDurationMs: Math.round(fetchDurationMs),
        dbWriteDurationMs: Math.round(dbWriteDurationMs), writeQueueWaitMs: Math.round(writeQueueWaitMs),
      });
    }
    catch { /* Observability callbacks must not interrupt collection or persistence. */ }
  };

  const persistBatch = async (batch: FundamentalsRow[]) => {
    const writeStarted = performance.now();
    const observedAt = new Date();
    const batchFailures = bufferFailures.splice(0, bufferFailures.length);
    if (batch.length === 0 && batchFailures.length === 0) {
      dbWriteDurationMs += performance.now() - writeStarted;
      return;
    }
    let lastError: unknown;
    for (let attempt = 1; attempt <= 3; attempt++) try {
      await db.transaction(async (tx) => {
        if (batch.length) {
          const succeeded = batch.map(({ market, code, name }) => ({ market, code, name }));
          await tx.insert(instrumentFundamentalHistory).values(batch.map((row) => ({ ...row, observedAt, fetchedAt: observedAt })))
            .onConflictDoNothing({ target: [instrumentFundamentalHistory.market, instrumentFundamentalHistory.code, instrumentFundamentalHistory.observedAt] });
          const snapshotRows = batch.map((row) => ({ ...row, observedAt, fetchedAt: observedAt }));
          await tx.insert(instrumentFundamentalSnapshots).values(snapshotRows)
            .onConflictDoUpdate({ target: [instrumentFundamentalSnapshots.market, instrumentFundamentalSnapshots.code], set: { name: sql`excluded.name`, price: sql`excluded.price`, changeRate: sql`COALESCE(excluded.change_rate, ${instrumentFundamentalSnapshots.changeRate})`, open: sql`COALESCE(excluded.open, ${instrumentFundamentalSnapshots.open})`, high: sql`COALESCE(excluded.high, ${instrumentFundamentalSnapshots.high})`, low: sql`COALESCE(excluded.low, ${instrumentFundamentalSnapshots.low})`, volume: sql`COALESCE(excluded.volume, ${instrumentFundamentalSnapshots.volume})`, tradingValue: sql`COALESCE(excluded.trading_value, ${instrumentFundamentalSnapshots.tradingValue})`, marketCap: sql`COALESCE(excluded.market_cap, ${instrumentFundamentalSnapshots.marketCap})`, listedShares: sql`COALESCE(excluded.listed_shares, ${instrumentFundamentalSnapshots.listedShares})`, currency: sql`COALESCE(excluded.currency, ${instrumentFundamentalSnapshots.currency})`, source: sql`excluded.source`, rawPayload: sql`excluded.raw_payload`, observedAt, fetchedAt: observedAt } });
        }
        await markFundamentalBatchInTransaction(tx, progress.jobId, batch.map(({ market, code, name }) => ({ market, code, name })), batchFailures.map((failure) => ({ ...failure, name: "", errorCode: getErrorCode(failure.error) })));
      });
      break;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 250));
    }
    if (lastError) databaseFailure = { errorCode: "DATABASE_CONNECTION_FAILED" };
    if (batch.length && !lastError) {
      savedCount += batch.length;
      for (const row of batch) { const counts = marketCounts.get(row.market); if (counts) counts.savedCount += 1; }
    }
    if (lastError && batch.length) {
      databaseFailure = { errorCode: "DATABASE_CONNECTION_FAILED" };
      failureCount += batch.length;
      failureCodeCounts.DATABASE_CONNECTION_FAILED = (failureCodeCounts.DATABASE_CONNECTION_FAILED ?? 0) + batch.length;
      for (const row of batch) {
        failedInstrumentKeys.add(`${row.market}:${row.code}`);
        failureCodeCountsByMarket[row.market] ??= {};
        failureCodeCountsByMarket[row.market].DATABASE_CONNECTION_FAILED = (failureCodeCountsByMarket[row.market].DATABASE_CONNECTION_FAILED ?? 0) + 1;
        failureAggregator.record(row.market, "DATABASE_CONNECTION_FAILED");
        if (failures.length < MAX_FAILURE_SAMPLES) failures.push({ market: row.market, code: row.code, error: "DATABASE_CONNECTION_FAILED" });
      }
      await db.transaction(async (tx) => markFundamentalBatchInTransaction(tx, progress.jobId, [], batch.map((row) => ({ market: row.market, code: row.code, name: row.name, errorCode: "DATABASE_CONNECTION_FAILED" })))).catch(() => undefined);
    }
    if (batchFailures.length && !lastError) persistedFailureCount += batchFailures.length;
    dbWriteDurationMs += performance.now() - writeStarted;
    await emitProgress();
  };

  const writeQueue = new BoundedWriteQueue<FundamentalsRow[]>(async (batch) => { await persistBatch(batch); }, 1, WRITE_QUEUE_CAPACITY, (queueWaitMs) => {
    writeQueueWaitMs += queueWaitMs;
  });
  const enqueueBatch = async (batch: FundamentalsRow[]) => {
    try { await writeQueue.enqueue(batch); }
    catch (error) {
      for (const row of batch) addFailure(row, `DB_QUEUE_FAILED: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  const enqueueCurrentFailures = async () => {
    if (!bufferFailures.length) return;
    await enqueueBatch([]);
  };
  const flushFullBatch = async () => {
    while (bufferedRows.length >= WRITE_BATCH_SIZE) {
      const batch = bufferedRows.splice(0, WRITE_BATCH_SIZE);
      await persistBatch(batch);
    }
  };

  let cursor = 0;
  const fetchWorker = async () => {
    while (true) {
      const item = instruments[cursor++];
      if (!item) return;
      const fetchStarted = performance.now();
      try {
        let data: Record<string, any> | null;
        let source: string;
        if (isDomesticMarket(item.market)) {
          data = await fetchKrPriceDetail(item.code);
          source = "KIS_DOMESTIC_PRICE";
        } else {
          const response = await fetchKisUsPriceDetail({ code: item.code, market: item.market, forceRefresh: true, allowStaleFallback: false });
          const output = fundamentalsOutput(response?.parsed);
          if (!response) throw new Error("KIS_TOKEN_UNAVAILABLE");
          data = {
            ok: response?.ok && response.stale !== true,
            stale: response?.stale === true,
            status: response?.status,
            price: firstPositiveFundamentalNumber(output.last, output.t_prpr, output.price),
            changeRate: finiteNumber(output.t_xrat ?? output.prdy_ctrt),
            volume: finiteNumber(output.tvol ?? output.pvol ?? output.vol),
            tradingValue: firstNonNegativeFundamentalNumber(output.tamt, output.tamnt, output.pamt),
            marketCap: calculateKisUsMarketCap(output) ?? firstPositiveFundamentalNumber(output.tomv, output.hts_avls, output.market_cap, output.marketCap) ?? positiveFromRawOutputs(response?.parsed, ["tomv", "hts_avls", "market_cap", "marketCap"]),
            listedShares: firstPositiveFundamentalNumber(output.shar, output.lstn_stcn, output.shares),
            currency: String(output.crcy ?? output.currency ?? "USD"),
            exchange: String(output.excd ?? output.exchange ?? item.market),
            raw: response?.parsed ?? {},
          };
          source = "KIS_OVERSEAS_PRICE";
        }

        if (data?.stale) throw new Error("KIS_STALE_DATA");
        if (!data) throw new Error("KIS_TOKEN_UNAVAILABLE");
        if (!data.ok) {
          const diagnostics = quoteResponseDiagnostics(data.status, data.raw ?? data.parsed);
          const raw = data.raw ?? data.parsed;
          const record = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
          const failure = classifyFundamentalProviderFailure({ status: Number(data.status ?? 0), responseOk: false, rtCd: record.rt_cd ?? record.rtCd, messageCode: record.msg_cd ?? record.msgCd, price: data.price, marketCap: data.marketCap });
          throw new Error(failure ?? `KIS_REQUEST_FAILED_HTTP_${data.status ?? "UNKNOWN"}${diagnostics}`);
        }
        const rawResponse = data.raw ?? data.parsed;
        const diagnosticsResponse = rawResponse && typeof rawResponse === "object" ? rawResponse as Record<string, unknown> : {};
        const failureCode = classifyFundamentalProviderFailure({ status: Number(data.status ?? 0), responseOk: true, stale: data.stale, rtCd: diagnosticsResponse.rt_cd ?? diagnosticsResponse.rtCd, messageCode: diagnosticsResponse.msg_cd ?? diagnosticsResponse.msgCd, price: data.price, marketCap: data.marketCap });
        if (failureCode) throw new Error(failureCode);
        const outputForFallback = fundamentalsOutput(data.parsed);
        const rawPrice = positiveFromRawOutputs(data.parsed, ["last", "t_prpr", "price"]);
        const price = firstPositiveFundamentalNumber(data.price, outputForFallback.last, outputForFallback.t_prpr, outputForFallback.price, rawPrice);
        if (price === null || price <= 0) {
          const rawQuote = data.raw ?? data.parsed;
          throw new Error(`KIS_EMPTY_OR_INVALID_PRICE${quoteResponseDiagnostics(data.status, rawQuote)}${quotePayloadDiagnostics(rawQuote)}`);
        }
        const marketCap = firstPositiveFundamentalNumber(data.marketCap, outputForFallback.tomv, outputForFallback.hts_avls, outputForFallback.market_cap, outputForFallback.marketCap, positiveFromRawOutputs(data.parsed, ["tomv", "hts_avls", "market_cap", "marketCap"]));
        if (marketCap === null || marketCap <= 0) throw new Error("KIS_MARKET_CAP_MISSING_OR_INVALID");

        const row: FundamentalsRow = {
          market: item.market, code: item.code, name: item.name, price,
          changeRate: firstFiniteFundamentalNumber(data.changeRate, outputForFallback.t_xrat, outputForFallback.prdy_ctrt), open: firstFiniteFundamentalNumber(data.open, outputForFallback.open),
          high: firstFiniteFundamentalNumber(data.high, outputForFallback.high), low: firstFiniteFundamentalNumber(data.low, outputForFallback.low), volume: firstNonNegativeFundamentalNumber(data.volume, outputForFallback.tvol, outputForFallback.pvol, outputForFallback.vol),
          tradingValue: finiteNumber(data.tradingValue), marketCap: marketCap !== null && marketCap > 0 ? marketCap : null,
          listedShares: finiteNumber(data.listedShares),
          currency: data.currency ?? (isDomesticMarket(item.market) ? "KRW" : "USD"),
          source, rawPayload: JSON.stringify(data.raw ?? data.parsed ?? data),
        };
        fetchedCount += 1;
        const counts = marketCounts.get(item.market);
        if (counts) counts.fetchedCount += 1;
        bufferedRows.push(row);
        await flushFullBatch();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        addFailure(item, message);
        bufferFailures.push({ market: item.market, code: item.code, error: getErrorCode(message) });
      } finally {
        const duration = performance.now() - fetchStarted;
        fetchDurationMs += duration;
        const counts = marketCounts.get(item.market);
        if (counts) counts.fetchDurationMs += duration;
        processedCount += 1;
        if (processedCount % 100 === 0 || processedCount === instruments.length) await emitProgress();
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(FETCH_CONCURRENCY, Math.max(1, instruments.length)) }, fetchWorker));
  if (bufferedRows.length) await persistBatch(bufferedRows.splice(0, bufferedRows.length));
  await enqueueCurrentFailures();
  await writeQueue.close();

  const failedInstrumentCount = failedInstrumentKeys.size;
  const progressResult = await finishFundamentalRefresh(progress.jobId);
  const completeCount = progressResult.successCount;
  return {
    ok: progressResult.status === "SUCCESS",
    startedAt: startedAt.toISOString(),
    completedAt: new Date().toISOString(),
    instrumentCount: eligibleCount,
    fetchedCount,
    // A row can be persisted even when a required field (for example market cap) failed validation.
    // Keep persistence and full-instrument success as separate, non-overlapping counts.
    successCount: savedCount,
    completeCount,
    persistedCount: savedCount,
    failedInstrumentCount,
    failureCount,
    performance: {
      wallDurationMs: Math.round(performance.now() - startedClock),
      fetchDurationMs: Math.round(fetchDurationMs),
      dbWriteDurationMs: Math.round(dbWriteDurationMs),
      writeQueueWaitMs: Math.round(writeQueueWaitMs),
      instrumentsPerSecond: Number((processedCount / Math.max((performance.now() - startedClock) / 1000, 0.001)).toFixed(2)),
    },
    failureSamples: failures,
    failureSummary: failureAggregator.snapshot(),
    markets: [...marketCounts.entries()].map(([market, counts]) => ({ market, ...counts })),
    attemptedCount: processedCount,
    databaseFailure,
    failureCodeCounts,
    failureCodeCountsByMarket,
    progress: { jobId: progress.jobId, resumed: progress.resumed, skippedCompletedCount: progress.skippedCompletedCount, deferredRetryCount: progress.deferredRetryCount, nextRetryAt: progress.nextRetryAt, status: progressResult.status, cumulativeSuccessCount: progressResult.successCount, cumulativeFailureCount: progressResult.failedCount, pendingCount: progressResult.pendingCount },
    failures,
    unattemptedCount: 0,
  };
}

export function refreshInstrumentFundamentals(options: RefreshOptions = {}) {
  return withAutomationLock("instrument-fundamentals-refresh", async () => executeInstrumentFundamentalsRefresh(options));
}
