import pg from "pg";
import { resolve } from "node:path";
import { loadLocalEnv } from "../scripts/local-env.mjs";
import { fillMissingDailyCandleItems } from "../lib/daily-candle-fallback.mjs";
import { summarizeDailyCandleCoverage } from "../lib/daily-candle-coverage.mjs";
import { isDailyCacheSyncSuccessful, isDailyCacheWriteVerified } from "../lib/daily-cache-sync-result.mjs";
import { isValidCompactCalendarDate } from "../lib/calendar-date-quality.mjs";
import { isCalendarDate, validDailyCandleSql } from "./daily-candle-quality-sql.mjs";
import { refreshDailyCandleSummaries } from "./daily-candle-summary-sync.mjs";

const { Pool } = pg;
loadLocalEnv({ filePath: resolve(process.cwd(), ".env.local") });
process.env.LOCAL_DATABASE_URL ||= process.env.DATABASE_URL;
process.env.DAILY_CACHE_API_URL ||= process.env.PUBLIC_BASE_URL || process.env.RSS_BULLISH_REPORT_API_BASE_URL;
const dailyCacheApiBaseUrl = process.env.DAILY_CACHE_API_URL?.trim();
function validateDailyCacheApiBaseUrl(value) {
  try {
    const rawAuthority = value.match(/^https?:\/\/([^/?#]*)/i)?.[1] ?? "";
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || rawAuthority.includes("@")) throw new Error();
    return url.origin;
  } catch {
    throw new Error("DAILY_CACHE_API_URL must be a valid absolute HTTP(S) URL without credentials");
  }
}
const validatedDailyCacheApiBaseUrl = dailyCacheApiBaseUrl ? validateDailyCacheApiBaseUrl(dailyCacheApiBaseUrl) : null;
if (process.env.LOCAL_DATABASE_URL) {
  const databaseHost = new URL(process.env.LOCAL_DATABASE_URL).hostname;
  if (!["localhost", "127.0.0.1", "::1"].includes(databaseHost)) {
    throw new Error(`Refusing non-local database host: ${databaseHost}`);
  }
}
const supportedOptions = new Set([
  "market", "timeframe", "limit", "batch", "fetch-workers", "fallback-workers", "save-workers", "queue",
  "max-instruments", "market-cap-under", "market-cap-over", "market-cap-under-inclusive", "us-market-cap-under",
  "us-market-cap-under-inclusive", "date", "only-unrefreshed", "only-missing-date", "include-inactive-daily",
  "skip-fundamentals", "operating-kis-direct",
]);
const booleanOptions = new Set([
  "market-cap-under-inclusive", "us-market-cap-under-inclusive", "only-unrefreshed", "only-missing-date",
  "include-inactive-daily", "skip-fundamentals", "operating-kis-direct",
]);
const args = new Map();
for (const argument of process.argv.slice(2)) {
  if (!argument.startsWith("--")) throw new Error("Positional arguments are not supported");
  const separator = argument.indexOf("=");
  const name = argument.slice(2, separator < 0 ? undefined : separator);
  if (!supportedOptions.has(name)) throw new Error(`Unknown option: --${name}`);
  if (args.has(name)) throw new Error(`Duplicate option: --${name}`);
  if (separator < 0 && !booleanOptions.has(name)) throw new Error(`--${name} requires a value`);
  const value = separator < 0 ? "true" : argument.slice(separator + 1);
  if (!value) throw new Error(`--${name} requires a value`);
  if (booleanOptions.has(name) && !["true", "false"].includes(value)) {
    throw new Error(`--${name} must be true or false`);
  }
  args.set(name, value);
}
function readIntegerOption(name, defaultValue, minimum, maximum = Number.MAX_SAFE_INTEGER) {
  const rawValue = args.get(name);
  if (rawValue === undefined) return defaultValue;
  if (!/^\d+$/.test(rawValue)) throw new Error(`--${name} must be a non-negative decimal integer`);
  const value = Number(rawValue);
  if (!Number.isSafeInteger(value)) throw new Error(`--${name} must be a safe integer`);
  return Math.min(Math.max(value, minimum), maximum);
}
function readPositiveNumberOption(name) {
  const rawValue = args.get(name);
  if (rawValue === undefined) return null;
  if (!/^\d+(?:\.\d+)?$/.test(rawValue)) throw new Error(`--${name} must be a positive decimal number`);
  const value = Number(rawValue);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`--${name} must be a positive decimal number`);
  return value;
}
const marketArg = String(args.get("market") || "ALL").toUpperCase();
const timeframe = String(args.get("timeframe") || "D").toUpperCase();
const limit = readIntegerOption("limit", 120, 1, 300);
const batchSize = readIntegerOption("batch", 100, 1, 100);
const fetchConcurrency = readIntegerOption("fetch-workers", 3, 1, 8);
const fallbackConcurrency = readIntegerOption("fallback-workers", 1, 1, 4);
const saveConcurrency = readIntegerOption("save-workers", 2, 1, 4);
const queueLimit = readIntegerOption("queue", 10, 1, 50);
const maxInstruments = readIntegerOption("max-instruments", 0, 0);
const marketCapUnder = readPositiveNumberOption("market-cap-under");
const marketCapOver = readPositiveNumberOption("market-cap-over");
const marketCapUnderInclusive = args.get("market-cap-under-inclusive") === "true";
const usMarketCapUnder = readPositiveNumberOption("us-market-cap-under");
const usMarketCapUnderInclusive = args.get("us-market-cap-under-inclusive") === "true";
const targetDate = args.get("date") || null;
const onlyUnrefreshed = args.get("only-unrefreshed") === "true";
const onlyMissingDate = args.get("only-missing-date") === "true";
const includeInactiveDaily = args.get("include-inactive-daily") === "true";
const skipFundamentals = args.get("skip-fundamentals") === "true";
const operatingKisDirect = args.get("operating-kis-direct") === "true";
let fallbackRequested = 0;
let fallbackFailed = 0;
const telemetry = { httpRequests: 0, httpDurationMs: 0, fallbackDurationMs: 0, dbSaveBatches: 0, dbSaveDurationMs: 0, dbRowCountMismatches: 0, duplicateCandleRows: 0 };

function sanitizeErrorMessage(value) {
  return String(value)
    .replace(/\b(postgres(?:ql)?|https?):\/\/[^/\s@]*@/gi, "$1://<redacted>@")
    .replace(/([#?&](?:password|passwd|pwd|token|access[_-]?token|(?:api|app)[_-]?key|(?:app|client)[_-]?secret|secret(?:key)?|authorization|credential|signature|sig)=)[^&#\s]*/gi, "$1<redacted>")
    .replace(/(\/(?:api[_-]?key|app[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|signature|sig|credential|authorization)\/)[^/?#\s]+/gi, "$1<redacted>")
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, "$1<redacted>")
    .replace(/\b(password|passwd|pwd|token|access[_-]?token|(?:api|app)[_-]?key|(?:app|client)[_-]?secret|secret(?:key)?|authorization|credential|signature|sig)\s*[:=]\s*((?:Bearer|Basic)\s+)?([^\s,;&]+)/gi, "$1=<redacted>")
    .replace(/\b(password|passwd|pwd|token|access[_-]?token|(?:api|app)[_-]?key|(?:app|client)[_-]?secret|secret(?:key)?|authorization|credential|signature|sig)\s+(?:is|was)\s+([^\s,;&]+)/gi, "$1=<redacted>")
    .slice(0, 500);
}

function summarizeRuntimeError(error, depth = 0) {
  try {
    if (depth >= 4) return { name: "ErrorDepthLimit", message: "nested error detail omitted" };
    if (!(error instanceof Error)) return { name: "UnknownError", message: sanitizeErrorMessage(error) };
    const summary = {
      name: sanitizeErrorMessage(error.name).slice(0, 100),
      message: sanitizeErrorMessage(error.message),
    };
    if (typeof error.code === "string") summary.code = sanitizeErrorMessage(error.code).slice(0, 50);
    if (error instanceof AggregateError) {
      const aggregateErrors = error.errors;
      if (Array.isArray(aggregateErrors)) {
        summary.errors = aggregateErrors.slice(0, 20).map((item) => summarizeRuntimeError(item, depth + 1));
        if (aggregateErrors.length > summary.errors.length) summary.errorsOmitted = aggregateErrors.length - summary.errors.length;
      } else {
        summary.errors = [];
        summary.errorsUnavailable = true;
      }
    }
    if (error.cause !== undefined) summary.cause = summarizeRuntimeError(error.cause, depth + 1);
    return summary;
  } catch {
    return { name: "ErrorSummaryFailed", message: "error details unavailable" };
  }
}

function formatRuntimeError(error) {
  return JSON.stringify(summarizeRuntimeError(error));
}

if (!process.env.LOCAL_DATABASE_URL || !validatedDailyCacheApiBaseUrl) throw new Error(".env.local의 DATABASE_URL과 운영 서버 URL(PUBLIC_BASE_URL 또는 RSS_BULLISH_REPORT_API_BASE_URL)이 필요합니다.");
if (!["D", "W", "M"].includes(timeframe) || !["ALL", "KR", "US"].includes(marketArg)) throw new Error("잘못된 market/timeframe입니다.");
if (targetDate && !isCalendarDate(targetDate)) throw new Error("--date는 실제 달력의 YYYY-MM-DD 날짜여야 합니다.");
if (onlyUnrefreshed && (marketArg !== "US" || timeframe !== "D")) throw new Error("--only-unrefreshed=true는 --market=US --timeframe=D와 함께 사용해야 합니다.");
if (onlyMissingDate && (!targetDate || marketArg !== "US" || timeframe !== "D")) throw new Error("--only-missing-date=true는 --market=US --timeframe=D --date=YYYY-MM-DD와 함께 사용해야 합니다.");
if (includeInactiveDaily && (marketArg !== "US" || timeframe !== "D")) throw new Error("--include-inactive-daily=true는 --market=US --timeframe=D와 함께 사용해야 합니다.");
if (operatingKisDirect && (!onlyMissingDate || !includeInactiveDaily || marketArg !== "US" || timeframe !== "D" || !targetDate)) throw new Error("--operating-kis-direct=true는 --market=US --timeframe=D --include-inactive-daily=true --only-missing-date=true --date=YYYY-MM-DD와 함께 사용해야 합니다.");
if ((marketCapUnder !== null || marketCapOver !== null) && ([marketCapUnder, marketCapOver].some((value) => value !== null && (!Number.isFinite(value) || value <= 0)) || marketArg !== "KR" || timeframe !== "D")) throw new Error("--market-cap-under/over는 양수이며 --market=KR --timeframe=D와 함께 사용해야 합니다.");
if (marketCapUnder !== null && marketCapOver !== null && marketCapOver >= marketCapUnder) throw new Error("--market-cap-over는 --market-cap-under보다 작아야 합니다.");
if (usMarketCapUnder !== null && (!Number.isFinite(usMarketCapUnder) || usMarketCapUnder <= 0 || marketArg !== "US" || timeframe !== "D")) throw new Error("--us-market-cap-under는 양수이며 --market=US --timeframe=D와 함께 사용해야 합니다.");

const databaseConnectionTimeoutMs = 10_000;
const pool = new Pool({ connectionString: process.env.LOCAL_DATABASE_URL, connectionTimeoutMillis: databaseConnectionTimeoutMs });
let poolBackgroundErrorCount = 0;
let firstPoolBackgroundError = null;
pool.on("error", (error) => {
  poolBackgroundErrorCount++;
  if (firstPoolBackgroundError === null) firstPoolBackgroundError = summarizeRuntimeError(error);
  console.error(`[async-sync] database pool background error: ${formatRuntimeError(error)}`);
});
const apiBase = new URL("/api/public/daily-candles", validatedDailyCacheApiBaseUrl);

async function fetchJson(url) {
  const startedAt = performance.now();
  telemetry.httpRequests++;
  try {
    let response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    } catch (error) {
      const cause = error?.cause?.code || error?.cause?.message || error?.message || "unknown";
      throw new Error(`운영 API 네트워크 오류: ${url.pathname} ${cause}`);
    }
    const text = await response.text();
    let payload;
    try { payload = JSON.parse(text); } catch { throw new Error(`운영 API JSON 형식 오류: ${response.status} ${url.pathname}`); }
    if (!response.ok) throw new Error(`운영 API 실패: ${response.status} ${url.pathname}`);
    return payload;
  } finally {
    telemetry.httpDurationMs += performance.now() - startedAt;
  }
}

function makeQueue(max) {
  const items = [], waitingPush = [], waitingPop = [];
  let closed = false;
  const push = (item) => new Promise((resolve, reject) => {
    if (closed) return reject(new Error("QUEUE_CLOSED"));
    const pop = waitingPop.shift();
    if (pop) { pop(item); return resolve(); }
    if (items.length < max) { items.push(item); return resolve(); }
    waitingPush.push({ item, resolve, reject });
  });
  const pop = () => new Promise((resolve) => {
    const item = items.shift();
    if (item) { const next = waitingPush.shift(); if (next) { items.push(next.item); next.resolve(); } return resolve(item); }
    if (closed) return resolve(null);
    waitingPop.push(resolve);
  });
  const close = () => { closed = true; for (const resolve of waitingPop.splice(0)) resolve(null); for (const job of waitingPush.splice(0)) job.reject(new Error("QUEUE_CLOSED")); };
  return { push, pop, close };
}

async function fetchBatch(kind, scopes) {
  const table = kind === "KR" ? "kr_instrument_universe_candles" : "us_instrument_universe_candles";
  const byMarket = new Map();
  for (const row of scopes) (byMarket.get(row.market) ?? byMarket.set(row.market, []).get(row.market)).push(row.code);
  const parts = [];
  for (const [market, codes] of byMarket) {
    let payload;
    if (kind === "US" && operatingKisDirect) {
      payload = { ok: true, market, timeframe, items: [] };
      for (const code of codes) {
        const directUrl = new URL("/api/kis/market-flow", validatedDailyCacheApiBaseUrl);
        directUrl.searchParams.set("market", "US");
        directUrl.searchParams.set("mode", "daily");
        directUrl.searchParams.set("exchange", market);
        directUrl.searchParams.set("code", code);
        directUrl.searchParams.set("period", "0");
        directUrl.searchParams.set("toDate", targetDate.replaceAll("-", ""));
        try {
          const response = await fetchJson(directUrl);
          if (response.source !== "KIS" || response.market !== "US" || response.code !== code || response.ok !== true || !Array.isArray(response.rows)) {
            throw new Error(`KIS daily response unavailable: HTTP source=${response.source ?? "unknown"}`);
          }
          const candles = response.rows.filter((row) => row.xymd).map((row) => {
            const toNumber = (value) => {
              const number = Number(String(value ?? "").replaceAll(",", ""));
              return Number.isFinite(number) ? number : null;
            };
            return { date: String(row.xymd), open: toNumber(row.open), high: toNumber(row.high), low: toNumber(row.low), close: toNumber(row.clos), volume: toNumber(row.tvol), rawPayload: JSON.stringify(row) };
          }).filter((row) => row.close != null && row.close > 0);
          if (candles.length) payload.items.push({ code, candles, source: "OPERATING_KIS_DAILY_API" });
          else console.warn(`[async-sync] operating KIS daily returned no candles market=${market} code=${code}`);
        } catch (error) {
          console.warn(`[async-sync] operating KIS daily failed market=${market} code=${code}: ${formatRuntimeError(error)}`);
        }
      }
    } else {
      const url = new URL(apiBase); url.searchParams.set("market", market); url.searchParams.set("codes", codes.join(",")); url.searchParams.set("timeframe", timeframe); url.searchParams.set("limit", String(limit));
      payload = await fetchJson(url);
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)
      || payload.ok !== true || payload.market !== market || payload.timeframe !== timeframe || !Array.isArray(payload.items)) {
      throw new Error(`운영 일봉 API 응답 형식 오류: ${market}`);
    }
    const requestedCandleCodes = new Map(codes.map((code) => [String(code).trim().toUpperCase(), code]));
    const originalCandleCodes = new Set();
    for (const item of payload.items) {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        throw new Error(`운영 일봉 API 종목 응답 오류: ${market} code=missing`);
      }
      const code = String(item.code ?? "").trim().toUpperCase();
      if (!requestedCandleCodes.has(code) || originalCandleCodes.has(code) || !Array.isArray(item.candles)) {
        throw new Error(`운영 일봉 API 종목 응답 오류: ${market} code=${code || "missing"}`);
      }
      originalCandleCodes.add(code);
    }
    payload.items = payload.items.map((item) => ({
      ...item,
      code: requestedCandleCodes.get(String(item.code).trim().toUpperCase()),
    }));
    if (kind === "KR") {
      const fallback = await fillMissingDailyCandleItems({
        codes,
        items: payload.items,
        targetDate: onlyMissingDate ? targetDate : undefined,
        concurrency: fallbackConcurrency,
        fetchChart: async (code) => {
          const startedAt = performance.now();
          const chartUrl = new URL("/api/stock/chart", validatedDailyCacheApiBaseUrl);
          chartUrl.searchParams.set("code", code);
          chartUrl.searchParams.set("market", "KR");
          chartUrl.searchParams.set("timeframe", timeframe);
          try {
            return await fetchJson(chartUrl);
          } finally {
            telemetry.fallbackDurationMs += performance.now() - startedAt;
          }
        },
        onFailure: (code, error) => console.warn(`[async-sync] KR chart fallback failed code=${code}: ${formatRuntimeError(error)}`),
      });
      fallbackRequested += fallback.requestedFallbackCount;
      fallbackFailed += fallback.failedCodes.length;
      payload.items = fallback.items;
    } else if (kind === "US" && !operatingKisDirect) {
      const fallback = await fillMissingDailyCandleItems({
        codes,
        items: payload.items,
        targetDate: onlyMissingDate ? targetDate : undefined,
        concurrency: fallbackConcurrency,
        fetchChart: async (code) => {
          const startedAt = performance.now();
          const chartUrl = new URL("/api/stock/chart", validatedDailyCacheApiBaseUrl);
          chartUrl.searchParams.set("code", code);
          chartUrl.searchParams.set("market", "US");
          chartUrl.searchParams.set("exchange", market);
          chartUrl.searchParams.set("timeframe", timeframe);
          try {
            return await fetchJson(chartUrl);
          } finally {
            telemetry.fallbackDurationMs += performance.now() - startedAt;
          }
        },
        onFailure: (code, error) => console.warn(`[async-sync] US chart fallback failed market=${market} code=${code}: ${formatRuntimeError(error)}`),
      });
      fallbackRequested += fallback.requestedFallbackCount;
      fallbackFailed += fallback.failedCodes.length;
      payload.items = fallback.items;
    }
    const returnedCodes = new Set();
    for (const item of payload.items) {
      if (!codes.includes(item.code) || returnedCodes.has(item.code)) {
        throw new Error(`운영 일봉 API 종목 목록 오류: ${market}`);
      }
      if (!Array.isArray(item.candles)) {
        throw new Error(`운영 일봉 API 봉 데이터 누락: ${market}/${item.code}`);
      }
      returnedCodes.add(item.code);
    }
    const missingCodes = codes.filter((code) => !returnedCodes.has(code) || !payload.items.find((item) => item.code === code)?.candles.length);
    if (missingCodes.length) {
      if (kind === "KR") throw new Error(`운영 일봉 API 종목 누락: ${market} count=${missingCodes.length} sample=${missingCodes.slice(0, 10).join(",")}`);
      console.warn(`[async-sync] US candles unavailable market=${market} count=${missingCodes.length} sample=${missingCodes.slice(0, 10).join(",")}`);
    }
    let fundamentals = { items: [] };
    if (!skipFundamentals) {
      const fUrl = new URL("/api/public/instrument-fundamentals", validatedDailyCacheApiBaseUrl); fUrl.searchParams.set("market", market); fUrl.searchParams.set("codes", codes.join(","));
      fundamentals = await fetchJson(fUrl);
      if (!fundamentals || typeof fundamentals !== "object" || Array.isArray(fundamentals)
        || fundamentals.ok !== true || !Array.isArray(fundamentals.items)) {
        throw new Error(`운영 기본정보 API 응답 형식 오류: ${market}`);
      }
      const requestedFundamentalCodes = new Map(codes.map((code) => [String(code).trim().toUpperCase(), code]));
      const returnedFundamentalCodes = new Set();
      const fundamentalNumericFields = ["price", "changeRate", "open", "high", "low", "volume", "tradingValue", "marketCap", "listedShares"];
      for (const item of fundamentals.items) {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
          throw new Error(`원격 기본정보 종목 응답 오류: market=${market} code=missing`);
        }
        const code = String(item.code ?? "").trim().toUpperCase();
        const itemMarket = String(item.market ?? "").trim().toUpperCase();
        if (itemMarket !== String(market).trim().toUpperCase()
          || !requestedFundamentalCodes.has(code)
          || returnedFundamentalCodes.has(code)) {
          throw new Error(`원격 기본정보 종목 응답 오류: market=${market} code=${code || "missing"}`);
        }
        for (const field of fundamentalNumericFields) {
          if (!(field in item) || (item[field] !== null && (typeof item[field] !== "number" || !Number.isFinite(item[field])))) {
            throw new Error(`원격 기본정보 수치 필드 오류: market=${market} code=${code} field=${field}`);
          }
        }
        if (typeof item.name !== "string") {
          throw new Error(`원격 기본정보 텍스트 필드 오류: market=${market} code=${code} field=name`);
        }
        if (!("currency" in item) || (item.currency !== null && typeof item.currency !== "string")) {
          throw new Error(`원격 기본정보 텍스트 필드 오류: market=${market} code=${code} field=currency`);
        }
        for (const field of ["observedAt", "fetchedAt"]) {
          const timestamp = item[field];
          if (!(field in item) || (timestamp !== null && (typeof timestamp !== "string" || !Number.isFinite(Date.parse(timestamp))))) {
            throw new Error(`원격 기본정보 시간 필드 오류: market=${market} code=${code} field=${field}`);
          }
        }
        returnedFundamentalCodes.add(code);
      }
      fundamentals.items = fundamentals.items.map((item) => ({
        ...item,
        market,
        code: requestedFundamentalCodes.get(String(item.code).trim().toUpperCase()),
      }));
    }
    const compactTargetDate = targetDate?.replaceAll("-", "");
    const selectedItems = payload.items.map((item) => ({
      ...item,
      candles: compactTargetDate && !(onlyMissingDate && ["OPERATING_CHART_API", "OPERATING_KIS_DAILY_API"].includes(item.source))
        ? item.candles.filter((candle) => String(candle.date).replaceAll("-", "") === compactTargetDate)
        : item.candles,
    })).filter((item) => item.candles.length > 0);
    parts.push({ table, market, candles: selectedItems, fundamentals: fundamentals.items, missingCodes });
  }
  return parts;
}

async function persistParts(kind, parts) {
  const startedAt = performance.now();
  const client = await pool.connect();
  let clientReleased = false;
  let saved = 0;
  let duplicateCandleRows = 0;
  try {
    await client.query("BEGIN");
    for (const part of parts) {
      const inputRows = part.candles.flatMap((item) => (item.candles ?? []).map((candle) => ({ ...candle, code: item.code, source: candle.source ?? item.source ?? "OPERATING_DB_CACHE" })));
      const byInstrumentDate = new Map();
      for (const row of inputRows) {
        const date = String(row.date ?? "").replaceAll("-", "");
        const values = [row.open, row.high, row.low, row.close, row.volume];
        if (!isValidCompactCalendarDate(date) ||
          values.some((value) => value === null || value === undefined || (typeof value === "string" && value.trim() === "") || !Number.isFinite(Number(value))) ||
          values.slice(0, 4).some((value) => Number(value) <= 0) || Number(row.volume) < 0 ||
          Number(row.high) < Math.max(Number(row.open), Number(row.low), Number(row.close)) ||
          Number(row.low) > Math.min(Number(row.open), Number(row.high), Number(row.close))) {
          throw new Error(`invalid OHLCV candle market=${part.market} code=${row.code} date=${date || "missing"}`);
        }
        const key = `${row.code}:${date}`;
        const normalizedRow = { ...row, date, open: Number(row.open), high: Number(row.high), low: Number(row.low), close: Number(row.close), volume: Number(row.volume) };
        const existingRow = byInstrumentDate.get(key);
        if (existingRow) {
          const conflictingField = ["open", "high", "low", "close", "volume"].find((field) => existingRow[field] !== normalizedRow[field]);
          if (conflictingField) {
            throw new Error(`conflicting duplicate candle market=${part.market} code=${row.code} date=${date} field=${conflictingField}`);
          }
          duplicateCandleRows++;
          continue;
        }
        byInstrumentDate.set(key, normalizedRow);
      }
      const rows = [...byInstrumentDate.values()].sort((a, b) => a.code.localeCompare(b.code) || a.date.localeCompare(b.date));
      if (rows.length) {
        const codes = rows.map((row) => row.code);
        const dates = rows.map((row) => row.date);
        const opens = rows.map((row) => row.open);
        const highs = rows.map((row) => row.high);
        const lows = rows.map((row) => row.low);
        const closes = rows.map((row) => row.close);
        const volumes = rows.map((row) => row.volume);
        const sources = rows.map((row) => row.source);
        const result = await client.query(`
          INSERT INTO ${part.table} (market,code,timeframe,candle_date,open,high,low,close,volume,source,fetched_at)
          SELECT $1,v.code,$2,v.candle_date,v.open,v.high,v.low,v.close,v.volume,v.source,NOW()
            FROM unnest($3::text[],$4::text[],$5::double precision[],$6::double precision[],$7::double precision[],$8::double precision[],$9::double precision[],$10::text[])
              AS v(code,candle_date,open,high,low,close,volume,source)
          ON CONFLICT (market,code,timeframe,candle_date) DO UPDATE SET
            open=EXCLUDED.open,high=EXCLUDED.high,low=EXCLUDED.low,close=EXCLUDED.close,
            volume=EXCLUDED.volume,source=EXCLUDED.source,fetched_at=EXCLUDED.fetched_at`,
        [part.market, timeframe, codes, dates, opens, highs, lows, closes, volumes, sources]);
        const verifiedResult = await client.query(`
          SELECT COUNT(*)::int AS count
            FROM unnest($3::text[],$4::text[],$5::double precision[],$6::double precision[],$7::double precision[],$8::double precision[],$9::double precision[])
              AS input(code,candle_date,open,high,low,close,volume)
            JOIN ${part.table} stored
              ON stored.market=$1 AND stored.code=input.code AND stored.timeframe=$2 AND stored.candle_date=input.candle_date
             AND stored.fetched_at=transaction_timestamp()
             AND stored.open IS NOT DISTINCT FROM input.open
             AND stored.high IS NOT DISTINCT FROM input.high
             AND stored.low IS NOT DISTINCT FROM input.low
             AND stored.close IS NOT DISTINCT FROM input.close
             AND stored.volume IS NOT DISTINCT FROM input.volume`,
        [part.market, timeframe, codes, dates, opens, highs, lows, closes, volumes]);
        const verified = Number(verifiedResult.rows[0]?.count ?? 0);
        if (!isDailyCacheWriteVerified(rows.length, verified)) {
          throw new Error(`candle UPSERT verification mismatch market=${part.market} expected=${rows.length} verified=${verified}`);
        }
        if (timeframe === "D") {
          await refreshDailyCandleSummaries(client, kind, part.market, codes);
        }
        if (result.rowCount !== verified) {
          telemetry.dbRowCountMismatches++;
          console.warn(`[async-sync] DB rowCount differs from verified writes market=${part.market} commandCount=${result.rowCount} verified=${verified}`);
        }
        saved += verified;
      }
      if (!skipFundamentals) for (const item of part.fundamentals) await client.query(`INSERT INTO instrument_fundamental_snapshots (market,code,name,price,change_rate,open,high,low,volume,trading_value,market_cap,listed_shares,currency,source,raw_payload,observed_at,fetched_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'OPERATING_DB_API','{}',COALESCE($14,NOW()),COALESCE($15,NOW())) ON CONFLICT (market,code) DO UPDATE SET name=COALESCE(NULLIF(EXCLUDED.name,''),instrument_fundamental_snapshots.name),price=COALESCE(EXCLUDED.price,instrument_fundamental_snapshots.price),change_rate=COALESCE(EXCLUDED.change_rate,instrument_fundamental_snapshots.change_rate),open=COALESCE(EXCLUDED.open,instrument_fundamental_snapshots.open),high=COALESCE(EXCLUDED.high,instrument_fundamental_snapshots.high),low=COALESCE(EXCLUDED.low,instrument_fundamental_snapshots.low),volume=COALESCE(EXCLUDED.volume,instrument_fundamental_snapshots.volume),trading_value=COALESCE(EXCLUDED.trading_value,instrument_fundamental_snapshots.trading_value),market_cap=COALESCE(EXCLUDED.market_cap,instrument_fundamental_snapshots.market_cap),listed_shares=COALESCE(EXCLUDED.listed_shares,instrument_fundamental_snapshots.listed_shares),currency=COALESCE(EXCLUDED.currency,instrument_fundamental_snapshots.currency),source=EXCLUDED.source,observed_at=COALESCE(EXCLUDED.observed_at,instrument_fundamental_snapshots.observed_at),fetched_at=COALESCE(EXCLUDED.fetched_at,instrument_fundamental_snapshots.fetched_at)`, [item.market,item.code,item.name ?? "",item.price,item.changeRate,item.open,item.high,item.low,item.volume,item.tradingValue,item.marketCap,item.listedShares,item.currency,item.observedAt,item.fetchedAt]);
    }
    try {
      await client.query("COMMIT");
    } catch (error) {
      client.release(true);
      clientReleased = true;
      throw new Error("LOCAL_TRANSACTION_COMMIT_OUTCOME_UNKNOWN", { cause: error });
    }
  } catch (error) {
    if (!clientReleased) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        client.release(true);
        clientReleased = true;
        const originalMessage = error instanceof Error ? error.message : "unknown transaction error";
        const rollbackMessage = rollbackError instanceof Error ? rollbackError.message : "unknown rollback error";
        throw new AggregateError([error, rollbackError], `LOCAL_TRANSACTION_ROLLBACK_FAILED: ${originalMessage}; rollback=${rollbackMessage}`);
      }
    }
    throw error;
  } finally {
    if (!clientReleased) client.release();
    telemetry.dbSaveBatches++;
    telemetry.dbSaveDurationMs += performance.now() - startedAt;
  }
  telemetry.duplicateCandleRows += duplicateCandleRows;
  return { saved, duplicateCandleRows };
}

async function syncMarket(kind, universeTable) {
  const commonStockProductFilter = kind === "US"
    ? `AND u.is_etf=false AND u.is_warrant=false AND u.is_derivative=false
       AND u.is_dr=false AND u.is_leveraged=false AND u.is_inverse=false`
    : `AND u.is_etp=false AND u.is_warrant=false AND u.is_preferred=false AND u.is_suspended=false
       AND COALESCE(u.trading_halt_code,'') NOT IN ('Y','1')
       AND COALESCE(u.liquidation_code,'') NOT IN ('Y','1')
       AND COALESCE(u.managed_issue_code,'') <> 'Y'`;
  const dailyActiveFilter = kind === "US" && includeInactiveDaily ? "" : "AND u.daily_active=true";
  const universeResult = onlyMissingDate && kind === "US"
    ? await pool.query(`SELECT u.market,u.code FROM ${universeTable} u
       LEFT JOIN us_latest_daily_candles latest ON latest.market=u.market AND latest.code=u.code AND ${validDailyCandleSql("latest")}
       WHERE u.enabled=true ${dailyActiveFilter} AND u.instrument_type='COMMON_STOCK'
         ${commonStockProductFilter}
         ${onlyUnrefreshed ? "AND (latest.fetched_at IS NULL OR latest.fetched_at < $2)" : ""}
         AND NOT EXISTS (SELECT 1 FROM us_instrument_universe_candles c
           WHERE c.market=u.market AND c.code=u.code AND c.timeframe='D' AND c.candle_date=$1 AND ${validDailyCandleSql("c")})
       ORDER BY u.market,u.code`, onlyUnrefreshed
      ? [targetDate.replaceAll("-", ""), new Date(Date.now() - 30 * 60 * 1000)]
      : [targetDate.replaceAll("-", "")])
    : await pool.query(onlyUnrefreshed && kind === "US"
    ? `SELECT u.market,u.code FROM ${universeTable} u
       LEFT JOIN us_latest_daily_candles latest ON latest.market=u.market AND latest.code=u.code AND ${validDailyCandleSql("latest")}
       WHERE u.enabled=true ${dailyActiveFilter} AND u.instrument_type='COMMON_STOCK'
         ${commonStockProductFilter}
         AND (latest.fetched_at IS NULL OR latest.fetched_at < $1)
       ORDER BY u.market,u.code`
    : `SELECT u.market,u.code FROM ${universeTable} u WHERE u.enabled=true ${dailyActiveFilter} AND u.instrument_type='COMMON_STOCK'
       ${commonStockProductFilter} ORDER BY u.market,u.code`,
    onlyUnrefreshed && kind === "US" ? [new Date(Date.now() - 30 * 60 * 1000)] : []);
  let universeRows = universeResult.rows;
  let marketCapFilter = null;
  if (kind === "US" && usMarketCapUnder !== null) {
    const sourceCount = universeRows.length;
    const marketCapRows = await pool.query(`
      SELECT f.market,f.code,f.market_cap,f.currency
        FROM instrument_fundamental_snapshots f
        JOIN ${universeTable} u ON u.market=f.market AND u.code=f.code
       WHERE u.enabled=true ${dailyActiveFilter} AND u.instrument_type='COMMON_STOCK'
         AND u.is_etf=false AND u.is_warrant=false AND u.is_derivative=false AND u.is_dr=false
         AND u.is_leveraged=false AND u.is_inverse=false
         AND f.currency='USD' AND f.market_cap > 0 AND f.fetched_at >= NOW() - INTERVAL '24 hours'
         AND f.market_cap ${usMarketCapUnderInclusive ? '<=' : '<'} $1
    `, [usMarketCapUnder]);
    const eligibleCodes = new Set(marketCapRows.rows.map((row) => `${row.market}:${row.code}`));
    universeRows = universeRows.filter((row) => eligibleCodes.has(`${row.market}:${row.code}`));
    marketCapFilter = { marketCapUnder: usMarketCapUnder, currency: "USD", maxSnapshotAgeHours: 24, eligible: universeRows.length, excluded: sourceCount - universeRows.length, source: "LOCAL_INSTRUMENT_FUNDAMENTAL_SNAPSHOT", unknownOrStaleExcluded: true };
  }
  if (marketCapUnder !== null || marketCapOver !== null) {
    const eligibleCodes = new Set();
    const capSnapshots = new Map();
    for (const market of ["KOSPI", "KOSDAQ"]) {
      const marketRows = universeRows.filter((row) => row.market === market);
      const fundamentalsBase = new URL("/api/public/instrument-fundamentals", validatedDailyCacheApiBaseUrl);
      fundamentalsBase.searchParams.set("market", market);
      for (let offset = 0; offset < marketRows.length; offset += 100) {
        const url = new URL(fundamentalsBase);
        url.searchParams.set("codes", marketRows.slice(offset, offset + 100).map((row) => row.code).join(","));
        const payload = await fetchJson(url);
        if (!payload.ok || !Array.isArray(payload.items)) throw new Error(`운영 fundamentals API 응답 형식 오류: ${market}`);
        for (const item of payload.items) {
          const cap = Number(item.marketCap);
          if (item.market === market && Number.isFinite(cap) && cap > 0
            && (marketCapUnder === null || (marketCapUnderInclusive ? cap <= marketCapUnder : cap < marketCapUnder))
            && (marketCapOver === null || cap > marketCapOver)) {
            eligibleCodes.add(`${market}:${item.code}`);
            capSnapshots.set(`${market}:${item.code}`, { marketCap: cap, observedAt: item.observedAt ?? null, fetchedAt: item.fetchedAt ?? null });
          }
        }
      }
    }
    const sourceCount = universeRows.length;
    universeRows = universeRows.filter((row) => eligibleCodes.has(`${row.market}:${row.code}`));
    const snapshotItems = universeRows.map((row) => ({ ...row, ...capSnapshots.get(`${row.market}:${row.code}`) }));
    for (let offset = 0; offset < snapshotItems.length; offset += 500) {
      const rows = snapshotItems.slice(offset, offset + 500);
      const client = await pool.connect();
      let clientReleased = false;
      try {
        await client.query("BEGIN");
        for (const item of rows) {
          await client.query(`INSERT INTO instrument_fundamental_snapshots (market,code,name,market_cap,currency,source,raw_payload,observed_at,fetched_at)
            VALUES ($1,$2,'',$3,'KRW','OPERATING_DB_API','{}',COALESCE($4,NOW()),COALESCE($5,NOW()))
            ON CONFLICT (market,code) DO UPDATE SET market_cap=EXCLUDED.market_cap,currency='KRW',source='OPERATING_DB_API',observed_at=EXCLUDED.observed_at,fetched_at=EXCLUDED.fetched_at`,
          [item.market,item.code,item.marketCap,item.observedAt,item.fetchedAt]);
        }
        try {
          await client.query("COMMIT");
        } catch (error) {
          client.release(true);
          clientReleased = true;
          throw new Error("LOCAL_TRANSACTION_COMMIT_OUTCOME_UNKNOWN", { cause: error });
        }
      } catch (error) {
        if (!clientReleased) {
          try {
            await client.query("ROLLBACK");
          } catch (rollbackError) {
            client.release(true);
            clientReleased = true;
            const originalMessage = error instanceof Error ? error.message : "unknown transaction error";
            const rollbackMessage = rollbackError instanceof Error ? rollbackError.message : "unknown rollback error";
            throw new AggregateError([error, rollbackError], `LOCAL_TRANSACTION_ROLLBACK_FAILED: ${originalMessage}; rollback=${rollbackMessage}`);
          }
        }
        throw error;
      } finally { if (!clientReleased) client.release(); }
    }
    marketCapFilter = { marketCapUnder, marketCapOver, currency: "KRW", eligible: universeRows.length, excluded: sourceCount - universeRows.length, source: "OPERATING_DB_FUNDAMENTAL_SNAPSHOT", markets: ["KOSPI", "KOSDAQ"], unknownExcluded: true };
  }
  const universe = maxInstruments > 0 ? universeRows.slice(0, maxInstruments) : universeRows;
  const queue = makeQueue(queueLimit); let cursor = 0, fetched = 0, saved = 0, failed = 0, duplicateCandleRows = 0, completedBatches = 0;
  const persistedParts = [];
  const totalBatches = Math.ceil(universe.length / batchSize);
  const producer = async () => { while (true) { const start = cursor; cursor += batchSize; const scopes = universe.slice(start, start + batchSize); if (!scopes.length) return; const index = Math.floor(start / batchSize) + 1; try { const parts = await fetchBatch(kind, scopes); const count = parts.reduce((n, p) => n + p.candles.reduce((x, i) => x + (i.candles?.length ?? 0), 0), 0); const missing = parts.reduce((n, part) => n + (part.missingCodes?.length ?? 0), 0); if (missing) failed += missing; if (count > 0) { fetched += count; await queue.push({ parts, index }); } else completedBatches++; } catch (error) { failed++; completedBatches++; console.warn(`[async-sync] fetch failed ${kind} batch=${index}/${totalBatches}: ${formatRuntimeError(error)}`); } } };
  const consumer = async () => { while (true) { const job = await queue.pop(); if (!job) return; try { const persisted = await persistParts(kind, job.parts); saved += persisted.saved; duplicateCandleRows += persisted.duplicateCandleRows; persistedParts.push(...job.parts); completedBatches++; console.info(`[async-sync] progress ${kind} batch=${completedBatches}/${totalBatches} fetched=${fetched} saved=${saved} duplicateCandleRows=${duplicateCandleRows} failed=${failed}`); } catch (error) { failed++; completedBatches++; console.warn(`[async-sync] save failed ${kind} batch=${job.index}/${totalBatches}: ${formatRuntimeError(error)}`); } } };
  const consumers = Promise.all(Array.from({ length: saveConcurrency }, consumer));
  await Promise.all([ ...Array.from({ length: fetchConcurrency }, producer) ]);
  queue.close();
  await consumers;
  return {
    universe: universe.length,
    marketCapFilter,
    batches: totalBatches,
    fetched,
    saved,
    duplicateCandleRows,
    failed,
    candleCoverage: summarizeDailyCandleCoverage(universe, persistedParts),
  };
}

let result = {};
let fatalFailure = null;
let poolShutdownFailure = null;
try {
  if (marketArg === "ALL" || marketArg === "KR") result.KR = await syncMarket("KR", "kr_common_stock_universe");
  if (marketArg === "ALL" || marketArg === "US") result.US = await syncMarket("US", "us_common_stock_universe");
} catch (error) {
  fatalFailure = summarizeRuntimeError(error);
} finally {
  try {
    await pool.end();
  } catch (error) {
    poolShutdownFailure = summarizeRuntimeError(error);
  }
}
const poolBackgroundFailure = poolBackgroundErrorCount ? { count: poolBackgroundErrorCount, first: firstPoolBackgroundError } : null;
const ok = !fatalFailure && !poolShutdownFailure && !poolBackgroundFailure && isDailyCacheSyncSuccessful(result, fallbackFailed);
console.log(JSON.stringify({ ok, mode: "async-bounded-queue", fetchConcurrency, fallbackConcurrency, saveConcurrency, queueLimit, maxInstruments, marketCapUnder, marketCapUnderInclusive, marketCapOver, usMarketCapUnder, usMarketCapUnderInclusive, targetDate, onlyUnrefreshed, onlyMissingDate, includeInactiveDaily, operatingKisDirect, fallbackRequested, fallbackFailed, ...(fatalFailure ? { fatalFailure } : {}), ...(poolShutdownFailure ? { poolShutdownFailure } : {}), poolBackgroundFailure, telemetry, result }));
if (!ok) process.exitCode = 1;
