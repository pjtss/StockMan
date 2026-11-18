import pg from "pg";
import { refreshDailyCandleSummaries } from "./daily-candle-summary-sync.mjs";
import { isValidCompactCalendarDate } from "../lib/calendar-date-quality.mjs";

const { Pool } = pg;
const allowedArgumentNames = new Set(["market", "timeframe", "limit", "batch", "skip-fundamentals"]);
const args = new Map();
for (const argument of process.argv.slice(2)) {
  if (!argument.startsWith("--") || argument === "--") throw new Error(`unexpected positional argument: ${argument}`);
  const separator = argument.indexOf("=");
  const name = argument.slice(2, separator < 0 ? undefined : separator);
  if (!allowedArgumentNames.has(name)) throw new Error(`unknown option: --${name}`);
  if (args.has(name)) throw new Error(`duplicate option: --${name}`);
  const value = separator < 0
    ? (name === "skip-fundamentals" ? "true" : "")
    : argument.slice(separator + 1);
  if (value === "") throw new Error(`missing value for --${name}`);
  args.set(name, value);
}
function readBoundedIntegerArgument(name, fallback, minimum, maximum) {
  const raw = args.get(name);
  if (raw === undefined) return fallback;
  if (!/^-?\d+$/.test(raw)) throw new Error(`--${name} must be a decimal integer`);
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed)) throw new Error(`--${name} must be a safe integer`);
  return Math.min(Math.max(parsed, minimum), maximum);
}
const requestedMarket = String(args.get("market") || "ALL").toUpperCase();
const timeframe = String(args.get("timeframe") || "D").toUpperCase();
const limit = readBoundedIntegerArgument("limit", 120, 1, 300);
const batchSize = readBoundedIntegerArgument("batch", 10, 1, 100);
const skipFundamentalsArgument = args.get("skip-fundamentals") ?? "false";
if (!["true", "false"].includes(skipFundamentalsArgument)) throw new Error("--skip-fundamentals must be true or false");
const skipFundamentals = skipFundamentalsArgument === "true";
const apiTimeoutMs = 35_000;
const databaseConnectionTimeoutMs = 10_000;
const localDatabaseUrl = process.env.LOCAL_DATABASE_URL?.trim();
const dailyCacheApiBaseUrl = process.env.DAILY_CACHE_API_URL?.trim();

if (!process.env.LOCAL_DATABASE_URL || !process.env.DAILY_CACHE_API_URL) {
  throw new Error("LOCAL_DATABASE_URL과 DAILY_CACHE_API_URL이 필요합니다.");
}
if (!["D", "W", "M"].includes(timeframe)) throw new Error("timeframe은 D, W, M 중 하나여야 합니다.");
if (!["ALL", "KR", "US"].includes(requestedMarket)) throw new Error("market은 ALL, KR, US 중 하나여야 합니다.");

function createDailyCacheApiUrl(baseUrl) {
  try {
    const normalizedBaseUrl = String(baseUrl).trim();
    const rawAuthority = normalizedBaseUrl.match(/^https?:\/\/([^/?#]*)/i)?.[1] ?? "";
    const url = new URL("/api/public/daily-candles", normalizedBaseUrl);
    const authority = url.href.match(/^https?:\/\/([^/]+)/i)?.[1] ?? "";
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password
      || rawAuthority.includes("@") || authority.includes("@")) {
      throw new Error("unsupported API URL configuration");
    }
    return url;
  } catch {
    throw new Error("DAILY_CACHE_API_URL must be a valid absolute HTTP(S) URL without credentials");
  }
}

const api = createDailyCacheApiUrl(dailyCacheApiBaseUrl);
let pool;
let poolBackgroundErrorCount = 0;
let firstPoolBackgroundError;
try {
  pool = new Pool({ connectionString: localDatabaseUrl, connectionTimeoutMillis: databaseConnectionTimeoutMs });
} catch {
  throw new Error("LOCAL_DATABASE_URL could not initialize PostgreSQL pool");
}
pool.on("error", (error) => {
  poolBackgroundErrorCount += 1;
  if (!firstPoolBackgroundError) firstPoolBackgroundError = summarizeError(error);
});

async function fetchJson(url, stage, market) {
  const stageError = (message, failurePhase, cause) => {
    const error = new Error(message, { cause });
    error.failurePhase = failurePhase;
    return error;
  };
  const requestFailureCode = (error) => error?.name === "TimeoutError" || error?.name === "AbortError"
    ? "REQUEST_TIMEOUT"
    : "REQUEST_FAILED";
  let response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(apiTimeoutMs) });
  } catch (error) {
    throw stageError(`운영 API 요청 실패 stage=${stage} market=${market} code=${requestFailureCode(error)} timeoutMs=${apiTimeoutMs}`, `${stage}-request`, error);
  }
  if (!response.ok) throw stageError(`운영 API HTTP 실패 stage=${stage} market=${market} status=${response.status}`, `${stage}-http`);
  let body;
  try {
    body = await response.text();
  } catch (error) {
    const code = requestFailureCode(error) === "REQUEST_TIMEOUT" ? "REQUEST_TIMEOUT" : "RESPONSE_BODY_FAILED";
    throw stageError(`운영 API 응답 본문 읽기 실패 stage=${stage} market=${market} code=${code} timeoutMs=${apiTimeoutMs}`, `${stage}-body`, error);
  }
  try {
    return JSON.parse(body);
  } catch (error) {
    throw stageError(`운영 API JSON 파싱 실패 stage=${stage} market=${market}`, `${stage}-json`, error);
  }
}

function normalizeCandleRows(candles, market, code) {
  const byDate = new Map();
  for (const candle of candles ?? []) {
    const date = String(candle.date ?? "").replaceAll("-", "");
    const values = [candle.open, candle.high, candle.low, candle.close, candle.volume];
    const numericValues = values.map(Number);
    if (!isValidCompactCalendarDate(date) ||
      values.some((value) => value === null || value === undefined || (typeof value === "string" && value.trim() === "")) ||
      numericValues.some((value) => !Number.isFinite(value)) ||
      numericValues.slice(0, 4).some((value) => value <= 0) || numericValues[4] < 0 ||
      numericValues[1] < Math.max(numericValues[0], numericValues[2], numericValues[3]) ||
      numericValues[2] > Math.min(numericValues[0], numericValues[1], numericValues[3])) {
      throw new Error(`원격 일봉 OHLCV 오류: ${market}/${code}/${date || "missing"}`);
    }
    const [open, high, low, close, volume] = numericValues;
    const normalized = { ...candle, date, open, high, low, close, volume };
    const existing = byDate.get(date);
    if (existing) {
      const sameValues = ["open", "high", "low", "close", "volume"].every((key) => existing[key] === normalized[key]);
      if (!sameValues) throw new Error(`원격 일봉 중복 충돌: ${market}/${code}/${date}`);
      continue;
    }
    byDate.set(date, normalized);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function logCommittedBatch({ kind, market, codeCount, received, saved, duplicateCandleCount, missingCount, fundamentalsReceived = 0, fundamentalsMissingCount = 0 }) {
  console.log(`[daily-cache-sync] committed kind=${kind} market=${market} codes=${codeCount} received=${received} saved=${saved} duplicateCandleCount=${duplicateCandleCount} missingCount=${missingCount} fundamentalsReceived=${fundamentalsReceived} fundamentalsMissingCount=${fundamentalsMissingCount}`);
}

function sanitizeErrorMessage(value) {
  return String(value)
    .replace(/\b(postgres(?:ql)?|https?):\/\/[^/\s@]*@/gi, "$1://<redacted>@")
    .replace(/([?&](?:password|passwd|pwd|token|access[_-]?token|(?:api|app)[_-]?key|(?:app|client)[_-]?secret|secret(?:key)?|authorization|credential|signature|sig)=)[^&#\s]*/gi, "$1<redacted>")
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, "$1<redacted>")
    .replace(/\b(password|passwd|pwd|token|access[_-]?token|(?:api|app)[_-]?key|(?:app|client)[_-]?secret|secret(?:key)?|authorization|credential|signature|sig)\s*[:=]\s*([^\s,;&]+)/gi, "$1=<redacted>")
    .slice(0, 500);
}

function summarizeError(error, depth = 0) {
  try {
    if (depth >= 4) return { name: "ErrorDepthLimit", message: "nested error detail omitted" };
    if (!(error instanceof Error)) return { name: "UnknownError", message: sanitizeErrorMessage(error) };
    const summary = { name: sanitizeErrorMessage(error.name).slice(0, 100), message: sanitizeErrorMessage(error.message) };
    if (error instanceof AggregateError) {
      const aggregateErrors = error.errors;
      if (!Array.isArray(aggregateErrors)) {
        summary.errors = [];
        summary.errorsUnavailable = true;
      } else {
        summary.errors = aggregateErrors.slice(0, 20).map((item) => summarizeError(item, depth + 1));
        if (aggregateErrors.length > summary.errors.length) {
          summary.errorsOmitted = aggregateErrors.length - summary.errors.length;
        }
      }
    }
    if (error.cause !== undefined) summary.cause = summarizeError(error.cause, depth + 1);
    return summary;
  } catch {
    return { name: "ErrorSummaryFailed", message: "error details unavailable" };
  }
}

async function withLocalTransaction(client, work) {
  let clientReleased = false;
  try {
    await client.query("BEGIN");
    const result = await work();
    try {
      await client.query("COMMIT");
    } catch (error) {
      client.release(true);
      clientReleased = true;
      throw new Error("LOCAL_TRANSACTION_COMMIT_OUTCOME_UNKNOWN", { cause: error });
    }
    return result;
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
  }
}

async function syncMarket(kind, universeTable) {
  const productFilter = kind === "US"
    ? `AND is_etf=false AND is_warrant=false AND is_derivative=false AND is_dr=false AND is_leveraged=false AND is_inverse=false`
    : `AND is_etp=false AND is_warrant=false AND is_preferred=false AND is_suspended=false
       AND COALESCE(trading_halt_code,'') NOT IN ('Y','1')
       AND COALESCE(liquidation_code,'') NOT IN ('Y','1')
       AND COALESCE(managed_issue_code,'') <> 'Y'`;
  let universeRows = [];
  let received = 0;
  let saved = 0;
  let duplicateCandleCount = 0;
  let missingCount = 0;
  let fundamentalsReceived = 0;
  let fundamentalsMissingCount = 0;
  const missingCodeSample = [];
  const fundamentalsMissingCodeSample = [];
  let currentBatch = { phase: "load-universe" };
  try {
  const universe = await pool.query(`SELECT market, code FROM ${universeTable}
    WHERE enabled = true AND daily_active = true AND instrument_type = 'COMMON_STOCK' ${productFilter}
    ORDER BY market, code`);
  universeRows = universe.rows;
  for (let offset = 0; offset < universeRows.length; offset += batchSize) {
    const scopes = universeRows.slice(offset, offset + batchSize);
    const byMarket = new Map();
    for (const row of scopes) {
      const codes = byMarket.get(row.market) ?? [];
      codes.push(row.code);
      byMarket.set(row.market, codes);
    }
    for (const [market, codes] of byMarket) {
      currentBatch = { phase: "daily-candles-request", market, offset, codeCount: codes.length };
      const url = new URL(api);
      url.searchParams.set("market", market);
      url.searchParams.set("codes", codes.join(","));
      url.searchParams.set("timeframe", timeframe);
      url.searchParams.set("limit", String(limit));
      const response = await fetch(url);
      if (!response.ok) throw new Error(`운영 API 실패: ${response.status} ${market}`);
      const payload = await response.json();
      if (!payload.ok || !Array.isArray(payload.items)) throw new Error(`운영 API 응답 형식 오류: ${market}`);
      received += payload.items.reduce((sum, item) => sum + (item.candles?.length ?? 0), 0);
      const table = kind === "KR" ? "kr_instrument_universe_candles" : "us_instrument_universe_candles";
      if (skipFundamentals) {
        const client = await pool.connect();
        const batchSaved = await withLocalTransaction(client, async () => {
          let count = 0;
          for (const item of normalizedItems) for (const candle of item.candles) {
            const upsertResult = await client.query(`INSERT INTO ${table} (market, code, timeframe, candle_date, open, high, low, close, volume, source, fetched_at)
              VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'OPERATING_DB_CACHE',NOW())
              ON CONFLICT (market, code, timeframe, candle_date) DO UPDATE SET open=EXCLUDED.open, high=EXCLUDED.high, low=EXCLUDED.low, close=EXCLUDED.close, volume=EXCLUDED.volume, source=EXCLUDED.source, fetched_at=EXCLUDED.fetched_at
              RETURNING candle_date`,
              [market, item.code, timeframe, candle.date, candle.open, candle.high, candle.low, candle.close, candle.volume]);
            if (upsertResult.rowCount !== 1) throw new Error(`원격 일봉 UPSERT 검증 실패: ${market}/${item.code}/${candle.date}`);
            count += 1;
          }
          if (timeframe === "D") await refreshDailyCandleSummaries(client, kind, market, normalizedItems.map((item) => item.code));
          return count;
        });
        saved += batchSaved;
        received += batchReceived;
        duplicateCandleCount += batchDuplicateCandleCount;
        missingCount += batchMissing.length;
        missingCodeSample.push(...batchMissing.slice(0, Math.max(0, 20 - missingCodeSample.length)).map((code) => `${market}:${code}`));
        logCommittedBatch({ kind, market, codeCount: codes.length, received: batchReceived, saved: batchSaved, duplicateCandleCount: batchDuplicateCandleCount, missingCount: batchMissing.length });
        continue;
      }
      const fundamentalsUrl = new URL("/api/public/instrument-fundamentals", dailyCacheApiBaseUrl);
      fundamentalsUrl.searchParams.set("market", market);
      fundamentalsUrl.searchParams.set("codes", codes.join(","));
      const fundamentalsResponse = await fetch(fundamentalsUrl);
      if (!fundamentalsResponse.ok) throw new Error(`운영 기본정보 API 실패: ${fundamentalsResponse.status} ${market}`);
      const fundamentalsPayload = await fundamentalsResponse.json();
      if (!fundamentalsPayload.ok || !Array.isArray(fundamentalsPayload.items)) throw new Error(`운영 기본정보 API 응답 형식 오류: ${market}`);
      const requestedFundamentalCodes = new Map(codes.map((code) => [String(code).trim().toUpperCase(), code]));
      const returnedFundamentalCodes = new Set();
      const fundamentalNumericFields = ["price", "changeRate", "open", "high", "low", "volume", "tradingValue", "marketCap", "listedShares"];
      for (const item of fundamentalsPayload.items) {
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
      const normalizedFundamentals = fundamentalsPayload.items.map((item) => ({
        ...item,
        market,
        code: requestedFundamentalCodes.get(String(item.code).trim().toUpperCase()),
      }));
      const batchFundamentalsMissingCodes = codes
        .filter((code) => !returnedFundamentalCodes.has(String(code).trim().toUpperCase()));
      currentBatch = {
        ...currentBatch,
        fundamentalsReceived: returnedFundamentalCodes.size,
        fundamentalsMissingCount: batchFundamentalsMissingCodes.length,
        fundamentalsMissingCodeSample: batchFundamentalsMissingCodes.slice(0, 20).map((code) => `${market}:${code}`),
      };
      currentBatch.phase = "database-save";
      const client = await pool.connect();
      const batchSaved = await withLocalTransaction(client, async () => {
        let count = 0;
        for (const item of normalizedItems) for (const candle of item.candles) {
          const upsertResult = await client.query(`INSERT INTO ${table} (market, code, timeframe, candle_date, open, high, low, close, volume, source, fetched_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'OPERATING_DB_CACHE',NOW())
            ON CONFLICT (market, code, timeframe, candle_date) DO UPDATE SET open=EXCLUDED.open, high=EXCLUDED.high, low=EXCLUDED.low, close=EXCLUDED.close, volume=EXCLUDED.volume, source=EXCLUDED.source, fetched_at=EXCLUDED.fetched_at
            RETURNING candle_date`,
            [market, item.code, timeframe, candle.date, candle.open, candle.high, candle.low, candle.close, candle.volume]);
          if (upsertResult.rowCount !== 1) throw new Error(`원격 일봉 UPSERT 검증 실패: ${market}/${item.code}/${candle.date}`);
          count += 1;
        }
        if (timeframe === "D") await refreshDailyCandleSummaries(client, kind, market, normalizedItems.map((item) => item.code));
        for (const item of normalizedFundamentals) {
          await client.query(`INSERT INTO instrument_fundamental_snapshots (market, code, name, price, change_rate, open, high, low, volume, trading_value, market_cap, listed_shares, currency, source, raw_payload, observed_at, fetched_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'OPERATING_DB_API','{}',COALESCE($14,NOW()),COALESCE($15,NOW()))
            ON CONFLICT (market, code) DO UPDATE SET name=EXCLUDED.name, price=EXCLUDED.price, change_rate=EXCLUDED.change_rate, open=EXCLUDED.open, high=EXCLUDED.high, low=EXCLUDED.low, volume=EXCLUDED.volume, trading_value=EXCLUDED.trading_value, market_cap=EXCLUDED.market_cap, listed_shares=EXCLUDED.listed_shares, currency=EXCLUDED.currency, source=EXCLUDED.source, observed_at=EXCLUDED.observed_at, fetched_at=EXCLUDED.fetched_at`,
            [item.market, item.code, item.name ?? "", item.price, item.changeRate, item.open, item.high, item.low, item.volume, item.tradingValue, item.marketCap, item.listedShares, item.currency, item.observedAt, item.fetchedAt]);
        }
        return count;
      });
      saved += batchSaved;
      received += batchReceived;
      duplicateCandleCount += batchDuplicateCandleCount;
      missingCount += batchMissing.length;
      missingCodeSample.push(...batchMissing.slice(0, Math.max(0, 20 - missingCodeSample.length)).map((code) => `${market}:${code}`));
      fundamentalsReceived += returnedFundamentalCodes.size;
      fundamentalsMissingCount += batchFundamentalsMissingCodes.length;
      fundamentalsMissingCodeSample.push(...batchFundamentalsMissingCodes
        .slice(0, Math.max(0, 20 - fundamentalsMissingCodeSample.length))
        .map((code) => `${market}:${code}`));
      logCommittedBatch({ kind, market, codeCount: codes.length, received: batchReceived, saved: batchSaved, duplicateCandleCount: batchDuplicateCandleCount, missingCount: batchMissing.length, fundamentalsReceived: returnedFundamentalCodes.size, fundamentalsMissingCount: codes.length - returnedFundamentalCodes.size });
    }
  }
  } catch (error) {
    const errorDetails = summarizeError(error);
    const errorMessage = errorDetails.message;
    const failure = {
      ...currentBatch,
      ...(typeof error?.failurePhase === "string" ? { phase: error.failurePhase } : {}),
      ...(errorMessage.startsWith("LOCAL_TRANSACTION_COMMIT_OUTCOME_UNKNOWN") ? { transactionOutcome: "COMMIT_UNKNOWN" } : {}),
      ...(errorMessage.startsWith("LOCAL_TRANSACTION_ROLLBACK_FAILED") ? { transactionOutcome: "ROLLBACK_FAILED" } : {}),
      error: errorMessage,
      errorDetails,
    };
    console.error(`[daily-cache-sync] failed kind=${kind} ${JSON.stringify(failure)}`);
    return { ok: false, universe: universeRows.length, received, saved, duplicateCandleCount, missingCount, missingCodeSample, fundamentalsReceived, fundamentalsMissingCount, fundamentalsMissingCodeSample, failure };
  }
  const ok = universeRows.length > 0 && saved > 0 && missingCount === 0;
  return { ok, universe: universeRows.length, received, saved, duplicateCandleCount, missingCount, missingCodeSample, fundamentalsReceived, fundamentalsMissingCount, fundamentalsMissingCodeSample };
}

const result = {};
let fatalFailure;
let poolShutdownFailure;
try {
  if (requestedMarket === "ALL" || requestedMarket === "KR") result.KR = await syncMarket("KR", "kr_common_stock_universe");
  if (requestedMarket === "ALL" || requestedMarket === "US") result.US = await syncMarket("US", "us_common_stock_universe");
} catch (error) {
  fatalFailure = { phase: "run", error: summarizeError(error).message };
} finally {
  try {
    await pool.end();
  } catch (error) {
    poolShutdownFailure = { phase: "pool-shutdown", error: summarizeError(error).message };
  }
}
const poolBackgroundFailure = poolBackgroundErrorCount > 0
  ? { count: poolBackgroundErrorCount, firstError: firstPoolBackgroundError }
  : undefined;
const ok = !fatalFailure && !poolShutdownFailure && !poolBackgroundFailure && Object.values(result).length > 0 && Object.values(result).every((marketResult) => marketResult.ok);
console.log(JSON.stringify({ ok, timeframe, limit, result, ...(fatalFailure ? { fatalFailure } : {}), ...(poolShutdownFailure ? { poolShutdownFailure } : {}), ...(poolBackgroundFailure ? { poolBackgroundFailure } : {}) }));
if (!ok) process.exitCode = 1;
