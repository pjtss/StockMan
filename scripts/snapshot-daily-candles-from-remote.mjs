import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isValidCompactCalendarDate } from "../lib/calendar-date-quality.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const allowed = new Set(["market", "limit"]);
const args = new Map();
for (const arg of process.argv.slice(2)) {
  if (!arg.startsWith("--")) throw new Error("위치 인수는 지원하지 않습니다.");
  const i = arg.indexOf("=");
  const key = arg.slice(2, i < 0 ? undefined : i);
  if (!allowed.has(key) || args.has(key)) throw new Error(`알 수 없거나 중복된 옵션: --${key}`);
  args.set(key, i < 0 ? "" : arg.slice(i + 1));
}
const market = (args.get("market") || "").toUpperCase();
if (!["US", "KR"].includes(market)) throw new Error("--market=US 또는 --market=KR가 필요합니다.");
const rawLimit = args.get("limit") || "120";
if (!/^\d+$/.test(rawLimit) || Number(rawLimit) < 1 || Number(rawLimit) > 300) throw new Error("--limit은 1~300 정수여야 합니다.");
const limit = Number(rawLimit);

const envPath = path.join(root, ".env.local");
const envText = await readFile(envPath, "utf8");
const env = new Map();
for (const line of envText.replace(/^\uFEFF/, "").split(/\r?\n/)) {
  const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
  if (!m) continue;
  let value = m[2];
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
  env.set(m[1], value);
}
const base = (env.get("DAILY_CACHE_API_URL") || env.get("PUBLIC_BASE_URL") || env.get("RSS_BULLISH_REPORT_API_BASE_URL") || "").trim();
if (!base) throw new Error(".env.local에 운영 DAILY_CACHE_API_URL 설정이 필요합니다.");
let endpoint;
try {
  const parsed = new URL("/api/public/daily-candles", base);
  if (!["https:", "http:"].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error();
  endpoint = parsed;
} catch { throw new Error("운영 API 주소는 credential 없는 절대 HTTP(S) URL이어야 합니다."); }

const exchanges = market === "US" ? ["NAS", "NYS", "AMS"] : ["KOSPI", "KOSDAQ"];
const snapshot = {
  schemaVersion: 1,
  market,
  source: "OPERATING_PUBLIC_API",
  endpoint: `${endpoint.origin}/api/public/daily-candles`,
  timeframe: "D",
  requestedLimit: limit,
  retrievedAt: new Date().toISOString(),
  exchanges: {},
  summary: { instrumentCount: 0, candleCount: 0, missingInstrumentCount: 0 },
};

for (const exchange of exchanges) {
  const universeItems = [];
  let universeOffset = 0;
  let universeTotal = null;
  do {
    const page = new URL(endpoint);
    page.searchParams.set("market", exchange);
    page.searchParams.set("universe", "true");
    page.searchParams.set("offset", String(universeOffset));
    page.searchParams.set("pageSize", "100");
    const response = await fetch(page, { signal: AbortSignal.timeout(60_000), headers: { accept: "application/json" } });
    if (!response.ok) throw new Error(`운영 유니버스 API HTTP 오류: ${response.status}`);
    const body = await response.json();
    if (!body || body.ok !== true || body.source !== "OPERATING_OFFICIAL_UNIVERSE" || !Array.isArray(body.items) || !body.page) throw new Error("운영 유니버스 API 응답 형식이 올바르지 않습니다.");
    if (universeTotal !== null && universeTotal !== Number(body.page.total)) throw new Error(`운영 유니버스가 조회 중 변경됐습니다: ${exchange}`);
    universeTotal = Number(body.page.total);
    if (body.items.length > 100 || body.items.some((item) => item.market !== exchange || !item.code || !item.name)) throw new Error(`운영 활성 보통주 유니버스 데이터 오류: ${exchange}`);
    universeItems.push(...body.items);
    universeOffset = body.page.nextOffset === null ? -1 : Number(body.page.nextOffset);
    if (universeOffset >= 0 && universeOffset <= Number(body.page.offset)) throw new Error("운영 유니버스 pagination 진행 오류");
  } while (universeOffset >= 0);
  if (!universeItems.length || universeItems.length !== universeTotal) throw new Error(`공식 활성 보통주 유니버스가 비었거나 pagination 누락: ${exchange}`);
  const universe = { rows: universeItems };
  const items = [];
  const missing = [];
  let batchCount = 0;
  for (let offset = 0; offset < universe.rows.length; offset += 100) {
    const batch = universe.rows.slice(offset, offset + 100);
    const page = new URL(endpoint);
    page.searchParams.set("market", exchange);
    page.searchParams.set("codes", batch.map((r) => r.code).join(","));
    page.searchParams.set("timeframe", "D");
    page.searchParams.set("limit", String(limit));
    const response = await fetch(page, { signal: AbortSignal.timeout(60_000), headers: { accept: "application/json" } });
    if (!response.ok) throw new Error(`운영 API HTTP 오류: ${response.status}`);
    const body = await response.json();
    if (!body || body.ok !== true || !Array.isArray(body.items)) throw new Error("운영 API 응답 형식이 올바르지 않습니다.");
    const responseByCode = new Map();
    const requestedCodes = new Set(batch.map((row) => row.code));
    for (const item of body.items) {
      if (item.market !== exchange || responseByCode.has(item.code) || !requestedCodes.has(item.code)) throw new Error(`응답 거래소 또는 코드 중복/범위 오류: ${exchange}/${item.code}`);
      responseByCode.set(item.code, item);
    }
    for (const master of batch) {
      const item = responseByCode.get(master.code);
      const key = `${master.market}:${master.code}`;
      if (!item) { missing.push({ market: master.market, code: master.code, name: master.name, reason: "NO_DAILY_CANDLES_RETURNED" }); continue; }
      if (item.name !== master.name || !Array.isArray(item.candles)) throw new Error(`운영 마스터/일봉 응답 불일치: ${key}`);
      if (!item.candles.length) { missing.push({ market: master.market, code: master.code, name: master.name, reason: "NO_VALID_DAILY_CANDLES_RETURNED" }); continue; }
      if (item.candles.length > limit || Number(item.metadata?.returnedCount) !== item.candles.length) throw new Error(`일봉 응답 건수 메타데이터 불일치: ${key}`);
      const byDate = new Set();
      for (const candle of item.candles) {
        const date = String(candle.date ?? "").replaceAll("-", "");
        const values = [candle.open, candle.high, candle.low, candle.close, candle.volume].map(Number);
        if (!isValidCompactCalendarDate(date) || values.some((n) => !Number.isFinite(n)) || Math.min(...values.slice(0, 4)) <= 0 || values[4] < 0 || values[1] < Math.max(values[0], values[2], values[3]) || values[2] > Math.min(values[0], values[1], values[3]) || !candle.fetchedAt || Number.isNaN(Date.parse(candle.fetchedAt)) || byDate.has(date)) throw new Error(`일봉 품질 오류: ${key}/${date}`);
        byDate.add(date);
      }
      items.push({ market: item.market, code: item.code, name: item.name, candles: item.candles.map((c) => ({ date: String(c.date).replaceAll("-", ""), open: Number(c.open), high: Number(c.high), low: Number(c.low), close: Number(c.close), volume: Number(c.volume), fetchedAt: new Date(c.fetchedAt).toISOString() })), metadata: { latestCandleDate: item.metadata?.latestCandleDate ?? null, dataUpdatedAt: item.metadata?.dataUpdatedAt ?? null, returnedCount: item.candles.length } });
    }
    batchCount += 1;
  }
  items.sort((a, b) => a.code.localeCompare(b.code));
  const dates = items.flatMap((item) => item.candles.map((c) => c.date)).sort();
  snapshot.exchanges[exchange] = { eligibleInstrumentCount: universe.rows.length, instrumentCount: items.length, candleCount: items.reduce((sum, item) => sum + item.candles.length, 0), latestCandleDate: dates.at(-1) ?? null, oldestCandleDate: dates[0] ?? null, requestCount: batchCount, missingInstruments: missing, instruments: items };
  snapshot.summary.instrumentCount += items.length;
  snapshot.summary.candleCount += snapshot.exchanges[exchange].candleCount;
  snapshot.summary.missingInstrumentCount += missing.length;
}
if (!snapshot.summary.instrumentCount) throw new Error("활성 보통주 일봉 결과가 비어 있어 기존 스냅샷을 보존합니다.");

const target = path.join(root, "docs", "operations", `daily-candles-${market.toLowerCase()}.json`);
const temp = `${target}.${process.pid}.tmp`;
await mkdir(path.dirname(target), { recursive: true });
await writeFile(temp, `${JSON.stringify(snapshot, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
await rename(temp, target);
console.log(JSON.stringify({ market, output: path.relative(root, target), retrievedAt: snapshot.retrievedAt, instrumentCount: snapshot.summary.instrumentCount, candleCount: snapshot.summary.candleCount, missingInstrumentCount: snapshot.summary.missingInstrumentCount, exchanges: Object.fromEntries(Object.entries(snapshot.exchanges).map(([key, value]) => [key, { eligibleInstrumentCount: value.eligibleInstrumentCount, instrumentCount: value.instrumentCount, latestCandleDate: value.latestCandleDate }])) }));
