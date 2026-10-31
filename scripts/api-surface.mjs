import { readFile, readdir } from "node:fs/promises";
import { mkdir, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";

const root = process.cwd();
const apiRoot = join(root, "app", "api");
const inventoryPath = join(root, "docs", "api", "route-inventory.json");
const openApiPath = join(root, "public", "openapi.json");
const methodsPattern = /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*\(|export\s+const\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*=/g;
const excludedPath = /\/(?:admin|debug|cron|internal|local)(?:\/|$)/i;
const userPath = /\/(?:auth|watchlist|user-activity|push)(?:\/|$)/i;
const requestAuthenticationPattern = /(?:headers\.get\(["'](?:authorization|x-api-key|x-daily-cache-key|cookie)["']\)|cookies\s*\(\s*\)|getServerSession|requireAdminSession|isCronRequestAuthorized|DAILY_CACHE_READ_API_KEY|REQUEST_LOG_SECRET|verifyBbExportToken|(?:is)?authorized\s*\(|requireApiAuth\s*\(|requireAuth\s*\(|verifyApiKey\s*\(|validateApiKey\s*\()/i;

async function routeFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await routeFiles(path));
    else if (entry.isFile() && entry.name === "route.ts") files.push(path);
  }
  return files;
}

function routePath(file) {
  const suffix = relative(apiRoot, file).split(sep).join("/").replace(/\/route\.ts$/, "");
  return `/api/${suffix.replace(/\[\.\.\.(\w+)\]/g, "{$1}").replace(/\[\[\.\.\.(\w+)\]\]/g, "{$1}").replace(/\[(\w+)\]/g, "{$1}")}`;
}

function accessFor(path, source, methods) {
  if (/requireAdminSession/.test(source)) return "admin-session";
  if (/isCronRequestAuthorized/.test(source)) return "cron-guarded";
  if (/x-request-log-secret|REQUEST_LOG_SECRET/.test(source)) return "internal-secret";
  if (/DAILY_CACHE_READ_API_KEY/.test(source)) return "service-bearer";
  if (excludedPath.test(path)) return "internal-or-operator";
  if (userPath.test(path)) return "user-session-or-user-data";
  if (/webhook|interactions/.test(path)) return "provider-webhook";
  if (/verifyBbExportToken/.test(source)) return "signed-link";
  if (/writeKisSignalSnapshot|issueKisRealtimeApprovalKey|\.insert\s*\(|\.update\s*\(|\.delete\s*\(|\.upsert\s*\(/.test(source)) return "read-with-side-effect";
  if (methods.some((method) => method !== "GET" && method !== "HEAD" && method !== "OPTIONS")) return "write-or-action";
  return "public-read-candidate";
}

function titleFromPath(path) {
  const tail = path.replace(/^\/api\//, "").replace(/[{}]/g, "").split("/").filter(Boolean);
  return `${tail.map((part) => part.split(/[-_]/).map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ")).join(" / ")} API`;
}

function queryParameters(source, path) {
  const names = new Set([...source.matchAll(/(?:searchParams|params)\.(?:get|has)\(["']([^"']+)["']\)/g)].map((match) => match[1]));
  const manual = {
    "/api/market-news": {
      hours: { type: "integer", minimum: 1, maximum: 24, default: 1, description: "조회 시간 범위(1~24). cursor 사용 시 최초 요청과 동일하게 유지합니다." },
      source: { type: "string", enum: ["ALL", "GLOBENEWSWIRE", "NASDAQ", "NASDAQ_TRADER", "SEC_EDGAR", "STOCKTITAN"], default: "ALL" },
      kind: { type: "string", enum: ["ALL", "NEWS", "FILING"], default: "ALL" },
      ticker: { type: "string", pattern: "^[A-Z][A-Z0-9.-]{0,9}$", description: "정확히 일치하는 감지 티커 필터." },
      pageSize: { type: "integer", minimum: 1, maximum: 100, default: 50 },
      limit: { type: "integer", minimum: 1, maximum: 100, description: "pageSize의 하위 호환 별칭." },
      cursor: { type: "string", maxLength: 1024, description: "이전 응답 page.nextCursor. 같은 필터와 hours로 전달." },
    },
    "/api/public/daily-candles": {
      market: { type: "string", enum: ["KR", "US", "KOSPI", "KOSDAQ", "NAS", "NYS", "AMS"], required: true },
      code: { type: "string", description: "단일 종목 코드. codes와 함께 쓰지 않습니다." },
      codes: { type: "string", description: "쉼표로 구분한 최대 100개 종목 코드." },
      timeframe: { type: "string", enum: ["D", "W", "M"], default: "D" },
      limit: { type: "integer", minimum: 1, maximum: 300, default: 120 },
    },
    "/api/public/instrument-fundamentals": {
      market: { type: "string", enum: ["KR", "US", "KOSPI", "KOSDAQ", "NAS", "NASDAQ", "NYS", "NYSE", "AMS", "AMEX"] },
      codes: { type: "string", description: "쉼표 구분 1~100개 종목 코드." },
    },
    "/api/public/market-intelligence": {
      ticker: { type: "string", description: "선택적 정확 티커 필터." },
      from: { type: "string", format: "date", description: "UTC 기준 시작 날짜(포함)." },
      to: { type: "string", format: "date", description: "UTC 기준 종료 날짜(미포함)." },
      limit: { type: "integer", minimum: 1, maximum: 100, default: 50 },
    },
    "/api/public/market-impact-events": {
      date: { type: "string", format: "date", description: "단일 이벤트 날짜. from/to와 함께 사용할 수 없습니다." },
      from: { type: "string", format: "date", description: "포함 시작일. to와 함께 사용합니다." },
      to: { type: "string", format: "date", description: "포함 종료일. from과 함께 사용합니다." },
      market: { type: "string", enum: ["KR", "US"] },
      ticker: { type: "string", pattern: "^[A-Z0-9._-]{1,32}$" },
      limit: { type: "integer", minimum: 1, maximum: 500, default: 100 },
    },
    "/api/scan/us-obv-divergence": {
      page: { type: "integer", minimum: 1, maximum: 100000, default: 1 },
      pageSize: { type: "integer", minimum: 1, maximum: 100, default: 50 },
      signalType: { type: "string", enum: ["ALL", "BOTH", "PIVOT", "TREND"], default: "ALL" },
      quality: { type: "string", enum: ["ALL", "HIGH", "STANDARD", "REVIEW"], default: "ALL" },
      sort: { type: "string", enum: ["priority", "liquidity", "obv", "priceDrop"], default: "priority" },
      minDollarVolume20d: { type: "number", minimum: 0, default: 0 },
    },
    "/api/public/us-smallcap-shares": {
      ticker: { type: "string", pattern: "^[A-Z][A-Z0-9./-]{0,14}$" },
      market: { type: "string", enum: ["NAS", "NASDAQ", "NYS", "NYSE", "AMS", "AMEX"] },
      limit: { type: "integer", minimum: 1, maximum: 100, default: 100 },
      cursor: { type: "string", description: "다음 페이지 커서. ticker 지정 시 사용할 수 없습니다." },
      minMarketCapUsd: { type: "number", minimum: 0, maximum: 100000000 },
      maxMarketCapUsd: { type: "number", exclusiveMinimum: 0, maximum: 100000000, default: 100000000 },
      minShares: { type: "string", pattern: "^\\d+$" },
      maxSharesExclusive: { type: "string", pattern: "^\\d+$" },
      sharesBasis: { type: "string", enum: ["sec_latest", "reviewed"], default: "sec_latest" },
    },
    "/api/dart/contract": { rceptNo: { type: "string", pattern: "^\\d{14}$", required: true, description: "14자리 DART 접수번호." } },
    "/api/dart/history": { company: { type: "string", minLength: 1, maxLength: 200, required: true } },
    "/api/disclosures": {
      date: { type: "string", format: "date", description: "hours 생략 시 서울 날짜 범위." },
      hours: { type: "integer", minimum: 1, maximum: 24, description: "지정하면 date 대신 최근 시간 범위." },
      source: { type: "string", default: "ALL", description: "ALL, RSS, STOCKTITAN, NASDAQ, NASDAQ_TRADER, GLOBENEWSWIRE, SEC_EDGAR, KRX_KIND, NEWSIS, MK, HANKYUNG, ETODAY, DART, SEC." },
      page: { type: "integer", minimum: 1, default: 1 },
      pageSize: { type: "integer", minimum: 1, maximum: 500, description: "limit 별칭." },
      limit: { type: "integer", minimum: 1, maximum: 500, description: "pageSize 별칭." },
    },
    "/api/domestic-financial-export": { format: { type: "string", enum: ["raw", "llm"], default: "normalized" } },
    "/api/stock/chart": {
      code: { type: "string", minLength: 1, maxLength: 64, required: true },
      company: { type: "string", maxLength: 200 },
      market: { type: "string", enum: ["KR", "US"], description: "생략 시 코드로 시장 추정, 기본 KR." },
      exchange: { type: "string", enum: ["KOSPI", "KOSDAQ", "NAS", "NYS", "AMS"] },
      timeframe: { type: "string", enum: ["D", "W", "M"], default: "D" },
    },
    "/api/stock/lookup": { market: { type: "string", enum: ["KR", "US"], default: "KR" }, codes: { type: "string", description: "쉼표 구분 최대 100개 코드." } },
    "/api/kis/investor-flow": {
      code: { type: "string", pattern: "^\\d{6}$", required: true },
      market: { type: "string", default: "J" },
      mode: { type: "string", enum: ["investor", "estimate", "program"], default: "investor" },
    },
    "/api/scan/daytrade": { market: { type: "string", enum: ["KR", "US"], default: "US" }, limit: { type: "integer", minimum: 1, maximum: 100, default: 30 } },
    "/api/stock/us/mfi-oversold": { period: { type: "integer", minimum: 2, maximum: 200 }, threshold: { type: "number", minimum: 0, maximum: 100 } },
    "/api/stock/us/news": {
      ticker: { type: "string", minLength: 1, maxLength: 32, required: true },
      period: { type: "string", enum: ["today", "3d", "7d", "1m"], default: "today" },
      exchange: { type: "string", enum: ["NAS", "NYS", "AMS"] },
    },
    "/api/stock/us/news-radar": { date: { type: "string", format: "date" }, time: { type: "string" } },
    "/api/stock/us/top-rising": {
      excd: { type: "string" }, gubn: { type: "string" }, nday: { type: "string" },
      volRang: { type: "string", default: "0" },
    },
  };
  const definitions = manual[path] ?? {};
  return [...names].sort().map((name) => {
    const definition = definitions[name] ?? { type: "string", description: "요청 query parameter. 허용값과 기본값은 구현 파일을 확인하세요." };
    const { required = false, ...schema } = definition;
    return { name, in: "query", required, schema, ...(definition.description ? { description: definition.description } : {}) };
  });
}

function responseSchema(path) {
  const generic = { type: "object", additionalProperties: true };
  const schemas = {
    "/api/health": { type: "object", required: ["status", "checkedAt", "responseTimeMs", "requestId"], properties: { status: { type: "string", enum: ["ok", "degraded"] }, checkedAt: { type: "string", format: "date-time" }, responseTimeMs: { type: "integer" }, requestId: { type: "string" } } },
    "/api/market-news": { type: "object", required: ["ok", "schemaVersion", "scope", "items", "page"], properties: { ok: { const: true }, schemaVersion: { const: "us-market-rss.v1" }, scope: { type: "object", properties: { market: { const: "US" }, sources: { type: "array", items: { type: "string" } }, source: { type: "string" }, kind: { type: "string", enum: ["ALL", "NEWS", "FILING"] }, ticker: { type: ["string", "null"] }, window: { type: "object", properties: { hours: { type: "integer" }, from: { type: "string", format: "date-time" }, to: { type: "string", format: "date-time" } } }, timezone: { const: "UTC" } } }, items: { type: "array", items: { type: "object", properties: { title: { type: "object", properties: { original: { type: "string" }, ko: { type: ["string", "null"] } } }, link: { type: "string", format: "uri" } } } }, page: { type: "object", properties: { pageSize: { type: "integer" }, returned: { type: "integer" }, nextCursor: { type: ["string", "null"] }, hasMore: { type: "boolean" } } } } },
    "/api/stock/lookup": { type: "object", required: ["names"], properties: { names: { type: "object", additionalProperties: { type: "string" } } } },
    "/api/disclosures": { type: "object", properties: { ok: { type: "boolean" }, date: { type: ["string", "null"], format: "date" }, window: { type: ["object", "null"] }, source: { type: "string" }, sort: { const: "publishedAt_desc" }, page: { type: ["integer", "null"] }, pageSize: { type: ["integer", "null"] }, items: { type: "array", items: { type: "object", additionalProperties: true, properties: { source: { type: "string" }, sourceType: { type: "string" }, title: { type: "string" }, summary: { type: "string" }, link: { type: "string" }, publishedAt: { type: ["string", "null"], format: "date-time" }, companyNames: { type: "array", items: { type: "string" } }, tickers: { type: "array", items: { type: "string" } }, contentStatus: { type: "string", enum: ["FULL", "METADATA_ONLY"] } } } }, total: { type: "integer" }, hasMore: { type: "boolean" } } },
    "/api/dart/ranking": { type: "object", properties: { fetchedAt: { type: "string", format: "date-time" }, items: { type: "array", items: { type: "object", additionalProperties: true } } } },
    "/api/dart/contract": { type: ["object", "null"], additionalProperties: true, description: "null means the filing has no matching contract details." },
    "/api/dart/history": { type: "array", items: { type: "object", properties: { title: { type: "string" }, judgment: { type: "string" }, publishedAt: { type: "string", format: "date-time" }, link: { type: "string" } } } },
    "/api/public/daily-candles": { oneOf: [{ type: "object", required: ["ok", "source", "market", "code", "timeframe", "candles", "metadata"], properties: { ok: { const: true }, source: { const: "OPERATING_DB_CACHE" }, market: { type: "string" }, code: { type: "string" }, timeframe: { type: "string", enum: ["D", "W", "M"] }, candles: { type: "array", items: { type: "object", required: ["date", "open", "high", "low", "close", "volume"], properties: { date: { type: "string", format: "date" }, open: { type: "number" }, high: { type: "number" }, low: { type: "number" }, close: { type: "number" }, volume: { type: "number" } } } }, metadata: { type: "object", properties: { latestCandleDate: { type: ["string", "null"], format: "date" }, dataUpdatedAt: { type: ["string", "null"], format: "date-time" }, returnedCount: { type: "integer" } } } } }, { type: "object", required: ["ok", "source", "market", "timeframe", "items"], properties: { ok: { const: true }, source: { const: "OPERATING_DB_CACHE" }, market: { type: "string" }, timeframe: { type: "string", enum: ["D", "W", "M"] }, items: { type: "array", items: { type: "object", properties: { code: { type: "string" }, candles: { type: "array", items: { type: "object", additionalProperties: true } } } } } } }] },
    "/api/public/instrument-fundamentals": { type: "object", properties: { ok: { const: true }, source: { const: "OPERATING_DB_FUNDAMENTAL_SNAPSHOT" }, market: { type: "string" }, items: { type: "array", items: { type: "object", properties: { market: { type: "string" }, code: { type: "string" }, name: { type: ["string", "null"] }, price: {}, changeRate: {}, open: {}, high: {}, low: {}, volume: {}, tradingValue: {}, marketCap: {}, listedShares: {}, currency: { type: "string" }, source: { type: "string" }, observedAt: {}, fetchedAt: {} } } } } },
    "/api/public/market-impact-events": { type: "object", required: ["ok", "schemaVersion", "query", "asOf", "items"], properties: { ok: { const: true }, schemaVersion: { const: "market-impact-events.v1" }, query: { type: "object" }, asOf: { type: "string", format: "date-time" }, items: { type: "array", items: { type: "object", required: ["eventId", "eventDate", "market", "ticker", "eventType", "eventKey", "status", "direction", "impactHorizon", "title", "sourceUrl"], properties: { eventId: { type: "string" }, eventDate: { type: "string", format: "date" }, market: { type: "string", enum: ["KR", "US"] }, ticker: { type: "string" }, companyName: { type: "string" }, eventType: { type: "string" }, eventKey: { type: "string" }, status: { type: "string", enum: ["REPORTED", "CONFIRMED_SCHEDULED", "ESTIMATED", "COMPLETED", "CANCELLED"] }, direction: { type: "string", enum: ["POSITIVE", "NEGATIVE", "MIXED", "UNCERTAIN"] }, impactHorizon: { type: "string", enum: ["INTRADAY", "SHORT_TERM", "LONG_TERM", "UNKNOWN"] }, title: { type: "string" }, summary: { type: "string" }, rationale: { type: "string" }, confidence: { type: "string", enum: ["HIGH", "MEDIUM", "LOW"] }, sourceType: { type: "string" }, sourceId: { type: "string" }, sourceUrl: { type: "string", format: "uri" }, publishedAt: { type: ["string", "null"], format: "date-time" }, evidence: { type: "array", items: { type: "object", additionalProperties: true } }, risks: { type: "array", items: { type: "string" } }, limitations: { type: "array", items: { type: "string" } }, updatedAt: { type: "string", format: "date-time" } } } } } },
    "/api/public/market-impact-events/guide": { type: "object", required: ["ok", "guideVersion", "schemaVersion", "updatedAt", "locale", "sourceOfTruth", "compatibility", "marketSeparation", "eventContract", "analysisWorkflow", "jsonSchema", "chatgptPromptTemplate"], properties: { ok: { const: true }, guideVersion: { type: "string", description: "안내 콘텐츠 semver." }, schemaVersion: { const: "market-impact-event-guide.v1" }, updatedAt: { type: "string", format: "date" }, locale: { const: "ko-KR" }, purpose: { type: "string" }, sourceOfTruth: { type: "object", additionalProperties: true }, compatibility: { type: "object", additionalProperties: true }, marketSeparation: { type: "object", required: ["KR", "US"], properties: { KR: { type: "object", additionalProperties: true }, US: { type: "object", additionalProperties: true } } }, eventContract: { type: "object", additionalProperties: true }, analysisWorkflow: { type: "array", items: { type: "object", required: ["id", "instruction"], properties: { id: { type: "string" }, instruction: { type: "string" } } } }, jsonSchema: { type: "object", description: "market-impact-events.v1 JSON Schema (Draft 2020-12).", additionalProperties: true }, chatgptPromptTemplate: { type: "string" } } },
    "/api/public/market-intelligence": { type: "object", properties: { ok: { const: true }, query: { type: "object" }, asOf: { type: "string", format: "date-time" }, instrument: { type: ["object", "null"], additionalProperties: true }, fundamental: { type: ["object", "null"], additionalProperties: true }, rssArticles: { type: "array", items: { type: "object", additionalProperties: true } }, bullishArticles: { type: "array", items: { type: "object", additionalProperties: true } }, secEvents: { type: "array", items: { type: "object", additionalProperties: true } } } },
    "/api/public/us-smallcap-shares": { type: "object", properties: { ok: { const: true }, source: { const: "SEC_COMPANY_FACTS_AND_STOCKMAN_DB" }, checkedAt: { type: "string", format: "date-time" }, criteria: { type: "object", additionalProperties: true }, filters: { type: "object", additionalProperties: true }, items: { type: "array", items: { type: "object", properties: { market: { type: "string" }, ticker: { type: "string" }, companyName: { type: ["string", "null"] }, currency: { const: "USD" }, marketCapUsd: {}, priceUsd: {}, fundamentalsFetchedAt: {}, sharesOutstanding: { type: ["object", "null"], additionalProperties: true }, facts: { type: "object", additionalProperties: true }, reviewedSharesOutstanding: { type: "object", additionalProperties: true }, secCompanyFacts: { type: "object", additionalProperties: true } } } }, pagination: { type: "object", properties: { returnedCount: { type: "integer" }, hasMore: { type: "boolean" }, nextCursor: { type: ["string", "null"] } } } } },
  };
  if (path === "/api/scan/us-obv-divergence") return {
    type: "object",
    required: ["ok", "schemaVersion", "algoVersion", "generatedAtUtc", "asOfEtDate", "scanStatus", "tradeEligibility", "universe", "parameters", "items", "pagination"],
    properties: {
      ok: { const: true }, schemaVersion: { const: "us-obv-divergence.v4" }, algoVersion: { const: "4.0.0" },
      generatedAtUtc: { type: "string", format: "date-time" }, asOfEtDate: { type: "string", format: "date" },
      market: { const: "US" }, securityClass: { const: "ACTIVE_COMMON_STOCK_FROM_STOCKMAN_OFFICIAL_MASTER" },
      marketCapLimitUsd: { const: 100000000 }, timeframe: { const: "D" },
      scanStatus: { type: "string", enum: ["COMPLETE", "PARTIAL"] }, tradeEligibility: { const: "WATCH_ONLY" },
      universe: { type: "object", additionalProperties: true }, parameters: { type: "object", additionalProperties: true },
      warnings: { type: "array", items: { type: "string" } }, filters: { type: "object", additionalProperties: true },
      pagination: { type: "object", required: ["page", "pageSize", "totalItems", "totalPages"], properties: { page: { type: "integer" }, pageSize: { type: "integer" }, totalItems: { type: "integer" }, totalPages: { type: "integer" } } },
      items: { type: "array", items: { type: "object", additionalProperties: true, required: ["ticker", "market", "candleDate", "candleMetadata", "signalType", "signalQuality"], properties: {
        ticker: { type: "string" }, market: { type: "string", enum: ["NAS", "NYS", "AMS"] }, name: { type: "string" },
        marketCapUsd: { type: ["number", "null"] }, marketCapObservedAtUtc: { type: ["string", "null"], format: "date-time" },
        candleDate: { type: "string", format: "date" }, close: { type: "number" },
        signalType: { type: "string", enum: ["TREND", "PIVOT", "BOTH"] }, signalQuality: { type: "string", enum: ["HIGH", "STANDARD", "REVIEW"] },
        price20dPct: { type: "number" }, obv20dAvgVolumeMultiple: { type: "number" },
        candleMetadata: { type: "array", items: { type: "object", required: ["candleDate", "dataUpdatedAtUtc"], properties: {
          candleDate: { type: "string", format: "date" }, dataUpdatedAtUtc: { type: ["string", "null"], format: "date-time" },
        } } },
      } } },
    },
  };
  return schemas[path] ?? generic;
}

async function makeOpenApi(allRoutes) {
  const paths = {};
  const summaries = {
    "/api/automation-settings": "레거시 자동화 주기 설정(사용 중단)",
    "/api/dart": "현재 DART 피드 조회",
    "/api/dart/contract": "DART 접수번호의 계약 상세 조회",
    "/api/dart/history": "회사 공시 이력 조회",
    "/api/dart/ranking": "DART 점수순 상위 공시 조회",
    "/api/disclosures": "RSS·공시 통합 피드 조회",
    "/api/domestic-financial-export": "국내 보통주 재무 및 봉 데이터 내보내기",
    "/api/health": "공개 서비스 상태 확인",
    "/api/kis/intraday-mvp": "국내 장중 탐지 요약 조회",
    "/api/kis/investor-flow": "국내 종목 수급 데이터 조회",
    "/api/market-news": "미국 뉴스와 SEC filing 조회",
    "/api/public/daily-candles": "운영 저장 일·주·월봉 조회",
    "/api/public/instrument-fundamentals": "종목 기본정보 스냅샷 조회",
    "/api/public/market-impact-events": "공시 기반 일별 주가 영향 이벤트 조회",
    "/api/public/market-impact-events/guide": "공시 영향 이벤트 분석·JSON 갱신 가이드 조회",
    "/api/public/market-intelligence": "티커 통합 시장·공시 정보 조회",
    "/api/public/us-smallcap-shares": "미국 보통주 시총·발행주식 수 조회",
    "/api/scan/daytrade": "일봉 기반 단타 후보 조회",
    "/api/scan/kr-accumulation": "국내 매집 후보 조회",
    "/api/scan/kr-bollinger-rebound-ema9-rvol-avg": "국내 EMA9·RVOL 볼린저 반등 후보",
    "/api/scan/kr-bollinger-rebound-rvol": "국내 RVOL 볼린저 반등 후보",
    "/api/scan/kr-ema9-rvol": "국내 EMA9·RVOL 후보",
    "/api/scan/kr-ema9-touch-rvol": "국내 EMA9 터치·RVOL 후보",
    "/api/scan/us-accumulation": "미국 매집 후보 조회",
    "/api/scan/us-daily-sideways-obv-adl": "미국 횡보 OBV·ADL 후보",
    "/api/scan/us-obv-divergence": "미국 보통주 일봉 OBV 강세 다이버전스 후보",
    "/api/stock/chart": "종목 OHLCV 차트·지표 조회",
    "/api/stock/kr/top-rising-chart": "국내 상승률 상위 종목 조회",
    "/api/stock/lookup": "종목 코드의 회사명 조회",
    "/api/stock/news": "티커 뉴스 조회",
    "/api/stock/us/ams-scout": "미국 AMEX Scout 후보 조회",
    "/api/stock/us/dmi": "미국 DMI 후보 조회",
    "/api/stock/us/macd": "미국 MACD 후보 조회",
    "/api/stock/us/mfi-oversold": "미국 MFI 과매도 후보 조회",
    "/api/stock/us/news": "미국 티커 뉴스 조회",
    "/api/stock/us/news-radar": "미국 뉴스 촉매 후보 조회",
    "/api/stock/us/top-rising": "KIS 미국 상승률 순위 조회",
    "/api/stock/us/top-rising-chart": "미국 상승률 상위 종목 조회",
  };
  for (const route of allRoutes) {
    if (!route.methods.includes("GET") || route.access !== "public-read-candidate") continue;
    const source = route.source;
    const summary = summaries[route.path] ?? titleFromPath(route.path);
    const pathItem = paths[route.path] ?? {};
    pathItem.get = {
      tags: [route.path.split("/")[2] ?? "general"],
      operationId: `get${route.path.replace(/^\/api\//, "").split(/[\/{}-]/).filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("")}`,
      summary,
      description: `${route.path === "/api/automation-settings" ? "Deprecated: 응답 헤더 Deprecation=true이며 관리자 feature-module 설정으로 대체되었습니다. " : ""}인증 없이 호출할 수 있는 읽기 전용 GET endpoint. Query field와 검증 규칙은 ${source}의 현재 구현을 기준으로 합니다. 프로젝트별 응답 DTO는 수집원·데이터 가용성에 따라 달라질 수 있습니다.`,
      parameters: queryParameters(await readFile(join(root, source), "utf8"), route.path),
      security: [],
      responses: {
        "200": { description: "요청 성공. 일부 endpoint는 route별 응답 schema를 제공하며, 전체 DTO는 현재 구현을 기준으로 합니다.", content: { "application/json": { schema: responseSchema(route.path) } } },
        "400": { description: "입력값 검증 실패(해당 endpoint에 한함)." },
        "429": { description: "요청 제한 초과(해당 endpoint에 한함)." },
        "500": { description: "서버 내부 오류." },
        "502": { description: "상위 데이터 제공자 오류(해당 endpoint에 한함)." },
        "503": { description: "서비스 또는 데이터 저장소를 사용할 수 없음." },
      },
      "x-code-path": source,
      "x-access-classification": route.access,
      ...(route.path === "/api/automation-settings" ? { deprecated: true } : {}),
    };
    paths[route.path] = pathItem;
  }
  return {
    openapi: "3.1.1",
    info: {
      title: "StockMan Read-only Public API",
      version: "1.0.0",
      description: "프로젝트 코드에서 발견한 외부 읽기 전용 GET 경로의 발견용 명세입니다. 상세 계약·필터 제한·응답 metadata는 /api-reference.md와 각 operation의 x-code-path를 기준으로 합니다. 쓰기·관리자·진단·cron·사용자 세션 API는 의도적으로 제외했습니다.",
      contact: { name: "StockMan API Documentation", url: "/api-reference.md" },
    },
    servers: [{ url: "/", description: "현재 배포 host 기준 상대 경로" }],
    security: [],
    tags: [...new Set(Object.keys(paths).map((path) => path.split("/")[2] ?? "general"))].sort().map((name) => ({ name })),
    paths,
    externalDocs: { description: "상세 호출 매뉴얼 및 전체 권한별 route 인벤토리", url: "/api-reference.md" },
  };
}

const routes = [];
const routePolicyFailures = [];
for (const file of await routeFiles(apiRoot)) {
  const source = await readFile(file, "utf8");
  const methods = [...source.matchAll(methodsPattern)].map((match) => match[1] ?? match[2]);
  if (!methods.length) continue;
  const path = routePath(file);
  const access = accessFor(path, source, methods);
  if (methods.includes("GET") && access === "public-read-candidate" && requestAuthenticationPattern.test(source)) {
    routePolicyFailures.push(`Externally readable GET must not inspect caller authentication: ${path}`);
  }
  if (methods.includes("GET") && access === "service-bearer") {
    routePolicyFailures.push(`Externally readable GET must not require bearer authentication: ${path}`);
  }
  routes.push({
    path,
    methods: [...new Set(methods)].sort(),
    access,
    source: relative(root, file).split(sep).join("/"),
  });
}
routes.sort((a, b) => a.path.localeCompare(b.path, "en"));

const mode = process.argv[2] ?? "check";
if (routePolicyFailures.length) {
  console.error(routePolicyFailures.join("\n"));
  process.exit(1);
}
if (mode === "write") {
  await Promise.all([
    mkdir(join(root, "docs", "api"), { recursive: true }),
    mkdir(join(root, "public"), { recursive: true }),
  ]);
  const openApiOutput = await makeOpenApi(routes);
  await Promise.all([
    writeFile(inventoryPath, `${JSON.stringify({ generatedFrom: "app/api/**/route.ts", routes }, null, 2)}\n`, "utf8"),
    writeFile(openApiPath, `${JSON.stringify(openApiOutput, null, 2)}\n`, "utf8"),
  ]);
  console.log(`Wrote ${routes.length} API routes and ${Object.keys(openApiOutput.paths).length} public GET operations.`);
  process.exit(0);
}

const failures = [...routePolicyFailures];
let inventory;
let openApi;
try {
  inventory = JSON.parse(await readFile(inventoryPath, "utf8"));
  openApi = JSON.parse(await readFile(openApiPath, "utf8"));
} catch (error) {
  console.error(`API contract files are missing or invalid: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

const normalize = (items) => JSON.stringify(items.map(({ path, methods, access, source }) => ({ path, methods, access, source })));
if (normalize(inventory.routes ?? []) !== normalize(routes)) failures.push("route-inventory.json is out of date; run `node scripts/api-surface.mjs write` and review the permission classifications.");
if (!String(openApi.openapi ?? "").startsWith("3.1.")) failures.push("OpenAPI document must use OpenAPI 3.1.");
if (!openApi.info?.title || !openApi.info?.version || !openApi.paths || typeof openApi.paths !== "object") failures.push("OpenAPI document is missing required info or paths fields.");

const routeByPath = new Map(routes.map((route) => [route.path, route]));
for (const [path, pathItem] of Object.entries(openApi.paths ?? {})) {
  const route = routeByPath.get(path);
  if (!route) {
    failures.push(`OpenAPI path has no matching route: ${path}`);
    continue;
  }
  for (const method of Object.keys(pathItem ?? {}).filter((key) => /^[a-z]+$/.test(key))) {
    const upperMethod = method.toUpperCase();
    if (!route.methods.includes(upperMethod)) failures.push(`OpenAPI method ${upperMethod} is not implemented by ${path}`);
    if (upperMethod !== "GET") failures.push(`External OpenAPI only documents read-only GET operations: ${upperMethod} ${path}`);
    if (route.access !== "public-read-candidate") failures.push(`OpenAPI exposes a restricted route (${route.access}): ${upperMethod} ${path}`);
    if (upperMethod === "GET" && Array.isArray(pathItem.security) && pathItem.security.length > 0) failures.push(`External read-only GET must not declare authentication: ${path}`);
  }
}
const expectedPublicPaths = routes.filter((route) => route.methods.includes("GET") && route.access === "public-read-candidate").map((route) => route.path).sort();
const documentedPaths = Object.keys(openApi.paths ?? {}).sort();
if (JSON.stringify(expectedPublicPaths) !== JSON.stringify(documentedPaths)) failures.push("OpenAPI public GET paths do not match the current route inventory; regenerate and review access classifications.");
const expectedOpenApi = await makeOpenApi(routes);
if (JSON.stringify(expectedOpenApi) !== JSON.stringify(openApi)) failures.push("openapi.json is out of date or manually diverges from generated route parameters/access metadata; run `node scripts/api-surface.mjs write` and review the result.");
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`API surface OK (${routes.length} route files; ${Object.keys(openApi.paths).length} externally documented read-only paths).`);
