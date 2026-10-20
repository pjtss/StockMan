import { getPool } from "@/lib/db";
import { getAccessToken, refreshAccessToken } from "@/lib/kis";
import { buildKisAuthorization, isKisTokenExpiredResponse } from "@/lib/kis-authorization";
import { loadKisApiConfig } from "@/lib/kis-api-config";
import { withKisRequestThrottle } from "@/lib/kis-request-throttle";

export const KIS_US_CONDITION_MARKETS = ["NAS", "NYS", "AMS"] as const;
export type KisUsConditionMarket = (typeof KIS_US_CONDITION_MARKETS)[number];

const CONDITION_GROUPS = [
  ["PRICECUR", "CO_YN_PRICECUR", "CO_ST_PRICECUR", "CO_EN_PRICECUR"],
  ["RATE", "CO_YN_RATE", "CO_ST_RATE", "CO_EN_RATE"],
  ["VALX", "CO_YN_VALX", "CO_ST_VALX", "CO_EN_VALX"],
  ["SHAR", "CO_YN_SHAR", "CO_ST_SHAR", "CO_EN_SHAR"],
  ["VOLUME", "CO_YN_VOLUME", "CO_ST_VOLUME", "CO_EN_VOLUME"],
  ["AMT", "CO_YN_AMT", "CO_ST_AMT", "CO_EN_AMT"],
  ["EPS", "CO_YN_EPS", "CO_ST_EPS", "CO_EN_EPS"],
  ["PER", "CO_YN_PER", "CO_ST_PER", "CO_EN_PER"],
] as const;

export const KIS_US_CONDITION_FILTER_KEYS = CONDITION_GROUPS.flatMap(([, enabled, start, end]) => [enabled, start, end]);
const QUERY_KEYS = new Set(["market", "KEYB", ...KIS_US_CONDITION_FILTER_KEYS]);

export type KisUsConditionFilters = Record<(typeof KIS_US_CONDITION_FILTER_KEYS)[number], string>;
export type KisUsConditionInput = { market: KisUsConditionMarket; filters: KisUsConditionFilters };

export type KisUsConditionSearchResult = {
  ok: boolean;
  status: number;
  market: KisUsConditionMarket;
  rows: Record<string, unknown>[];
  raw: Record<string, unknown> | null;
  diagnostics: { rt_cd: string | null; msg_cd: string | null; msg1: string | null; contentType: string | null };
  error?: "KIS_NON_JSON_RESPONSE" | "KIS_INVALID_JSON_RESPONSE" | "KIS_INVALID_RESPONSE_SHAPE" | "KIS_UPSTREAM_ERROR";
};

export type KisUsConditionQueryResult =
  | { ok: true; value: KisUsConditionInput }
  | { ok: false; error: string; field?: string; message: string };

function readSingle(params: URLSearchParams, key: string): { ok: true; value: string } | { ok: false } {
  const values = params.getAll(key);
  if (values.length > 1) return { ok: false };
  return { ok: true, value: (values[0] ?? "").trim() };
}

function parseBound(value: string, field: string): KisUsConditionQueryResult | number | null {
  if (!value) return null;
  if (value.length > 12 || !/^-?\d+(?:\.\d+)?$/.test(value)) {
    return { ok: false, error: "INVALID_FILTER", field, message: "범위 값은 12자 이내의 숫자여야 합니다." };
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return { ok: false, error: "INVALID_FILTER", field, message: "범위 값은 유한한 숫자여야 합니다." };
  return parsed;
}

export function parseKisUsConditionQuery(params: URLSearchParams): KisUsConditionQueryResult {
  for (const key of params.keys()) {
    if (!QUERY_KEYS.has(key)) return { ok: false, error: "UNKNOWN_PARAMETER", field: key, message: "지원하지 않는 query parameter입니다." };
    if (params.getAll(key).length > 1) return { ok: false, error: "DUPLICATE_PARAMETER", field: key, message: "같은 query parameter를 여러 번 지정할 수 없습니다." };
  }

  const marketValue = (params.get("market") ?? "NAS").trim().toUpperCase();
  if (!(KIS_US_CONDITION_MARKETS as readonly string[]).includes(marketValue)) {
    return { ok: false, error: "INVALID_MARKET", field: "market", message: "market은 NAS, NYS, AMS 중 하나여야 합니다." };
  }

  const keyb = params.get("KEYB")?.trim() ?? "";
  if (keyb) return { ok: false, error: "PAGINATION_UNSUPPORTED", field: "KEYB", message: "KIS 해외주식 조건검색은 다음 페이지 조회를 지원하지 않습니다. KEYB는 공백으로만 전달됩니다." };

  const filters = Object.fromEntries(KIS_US_CONDITION_FILTER_KEYS.map((key) => [key, ""])) as KisUsConditionFilters;
  for (const [, enabledKey, startKey, endKey] of CONDITION_GROUPS) {
    const enabledResult = readSingle(params, enabledKey);
    const startResult = readSingle(params, startKey);
    const endResult = readSingle(params, endKey);
    if (!enabledResult.ok || !startResult.ok || !endResult.ok) {
      return { ok: false, error: "DUPLICATE_PARAMETER", field: enabledKey, message: "같은 query parameter를 여러 번 지정할 수 없습니다." };
    }
    const enabled = enabledResult.value;
    const start = startResult.value;
    const end = endResult.value;
    if (enabled !== "" && enabled !== "1") {
      return { ok: false, error: "INVALID_FILTER", field: enabledKey, message: "조건 선택값은 사용 시 1, 미사용 시 공백이어야 합니다." };
    }
    if (!enabled && (start || end)) {
      return { ok: false, error: "FILTER_NOT_ENABLED", field: enabledKey, message: "범위를 사용하려면 해당 CO_YN 조건을 1로 지정해야 합니다." };
    }
    if (enabled && !start && !end) {
      return { ok: false, error: "FILTER_RANGE_REQUIRED", field: enabledKey, message: "조건을 사용하려면 시작값 또는 끝값을 하나 이상 지정해야 합니다." };
    }
    const startBound = parseBound(start, startKey);
    if (typeof startBound === "object" && startBound !== null) return startBound;
    const endBound = parseBound(end, endKey);
    if (typeof endBound === "object" && endBound !== null) return endBound;
    if (typeof startBound === "number" && typeof endBound === "number" && startBound > endBound) {
      return { ok: false, error: "INVALID_RANGE", field: startKey, message: "시작값은 끝값보다 클 수 없습니다." };
    }
    filters[enabledKey] = enabled;
    filters[startKey] = start;
    filters[endKey] = end;
  }
  return { ok: true, value: { market: marketValue as KisUsConditionMarket, filters } };
}

export function buildKisUsConditionSearchUrl(input: KisUsConditionInput) {
  const params = new URLSearchParams({ AUTH: "", EXCD: input.market, ...input.filters, KEYB: "" });
  return `https://openapi.koreainvestment.com:9443/uapi/overseas-price/v1/quotations/inquire-search?${params}`;
}

export function parseKisUsConditionResponse(input: { status: number; contentType: string | null; rawText: string; market: KisUsConditionMarket }): KisUsConditionSearchResult {
  const contentType = input.contentType?.split(";")[0]?.trim().toLowerCase() ?? null;
  if (!contentType || !(contentType === "application/json" || contentType.endsWith("+json"))) {
    return { ok: false, status: input.status, market: input.market, rows: [], raw: null, diagnostics: { rt_cd: null, msg_cd: null, msg1: null, contentType: input.contentType }, error: "KIS_NON_JSON_RESPONSE" };
  }
  let raw: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(input.rawText);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid response shape");
    raw = parsed as Record<string, unknown>;
  } catch {
    return { ok: false, status: input.status, market: input.market, rows: [], raw: null, diagnostics: { rt_cd: null, msg_cd: null, msg1: null, contentType: input.contentType }, error: "KIS_INVALID_JSON_RESPONSE" };
  }
  const output2 = raw.output2;
  if (!Array.isArray(output2) || output2.some((row) => !row || typeof row !== "object" || Array.isArray(row))) {
    return {
      ok: false,
      status: input.status,
      market: input.market,
      rows: [],
      raw: null,
      diagnostics: {
        rt_cd: raw.rt_cd == null ? null : String(raw.rt_cd),
        msg_cd: raw.msg_cd == null ? null : String(raw.msg_cd),
        msg1: raw.msg1 == null ? null : String(raw.msg1),
        contentType: input.contentType,
      },
      error: "KIS_INVALID_RESPONSE_SHAPE",
    };
  }
  const rows = output2 as Record<string, unknown>[];
  const rtCd = raw.rt_cd == null ? null : String(raw.rt_cd);
  const msgCd = raw.msg_cd == null ? null : String(raw.msg_cd);
  const msg1 = raw.msg1 == null ? null : String(raw.msg1);
  const ok = input.status >= 200 && input.status < 300 && rtCd === "0";
  return {
    ok,
    status: input.status,
    market: input.market,
    rows,
    raw,
    diagnostics: { rt_cd: rtCd, msg_cd: msgCd, msg1, contentType: input.contentType },
    ...(ok ? {} : { error: "KIS_UPSTREAM_ERROR" as const }),
  };
}

export async function fetchKisUsConditionSearch(input: KisUsConditionInput): Promise<KisUsConditionSearchResult | null> {
  const config = await loadKisApiConfig("us_trade_trend");
  const initialToken = await getAccessToken();
  if (!initialToken) return null;
  let token: string = initialToken;
  const headers = {
    "content-type": config.content_type || "application/json; charset=utf-8",
    Authorization: buildKisAuthorization(token),
    appkey: process.env.KIS_APPKEY?.trim() || "",
    appsecret: process.env.KIS_APPSECRET?.trim() || "",
    tr_id: "HHDFS76410000",
    custtype: config.custtype || "P",
    tr_cont: "",
  };
  const requestOnce = async () => withKisRequestThrottle(() => fetch(buildKisUsConditionSearchUrl(input), {
    headers: { ...headers, Authorization: buildKisAuthorization(token) },
    signal: AbortSignal.timeout(8_000),
  }));

  let response = await requestOnce();
  let rawText = await response.text();
  let parsed = parseKisUsConditionResponse({ status: response.status, contentType: response.headers.get("content-type"), rawText, market: input.market });
  if (isKisTokenExpiredResponse(response.status, parsed.raw)) {
    const refreshedToken = await refreshAccessToken(token);
    if (!refreshedToken) return null;
    token = refreshedToken;
    response = await requestOnce();
    rawText = await response.text();
    parsed = parseKisUsConditionResponse({ status: response.status, contentType: response.headers.get("content-type"), rawText, market: input.market });
  }
  return parsed;
}

export type KisUsConditionEligibilityResult = { rows: Record<string, unknown>[]; requestedCount: number; eligibleCount: number; excludedCount: number };

export async function filterKisUsConditionRows(market: KisUsConditionMarket, rows: Record<string, unknown>[]): Promise<KisUsConditionEligibilityResult> {
  const seen = new Set<string>();
  const keyed = rows.flatMap((row) => {
    const code = String(row.symb ?? row.code ?? "").trim().toUpperCase();
    const rowMarket = String(row.excd ?? "").trim().toUpperCase();
    if (!code || rowMarket !== market || seen.has(code)) return [];
    seen.add(code);
    return [{ code, row }];
  });
  const codes = [...new Set(keyed.map(({ code }) => code))];
  if (!codes.length) return { rows: [], requestedCount: rows.length, eligibleCount: 0, excludedCount: rows.length };

  const result = await getPool().query<{ code: string }>(`
    SELECT code
    FROM us_common_stock_universe
    WHERE market = $1
      AND code = ANY($2::text[])
      AND enabled = true
      AND daily_active = true
      AND instrument_type = 'COMMON_STOCK'
      AND COALESCE(is_etf, false) = false
      AND COALESCE(is_warrant, false) = false
      AND COALESCE(is_derivative, false) = false
      AND COALESCE(is_dr, false) = false
      AND COALESCE(is_leveraged, false) = false
      AND COALESCE(is_inverse, false) = false
  `, [market, codes]);
  const eligibleCodes = new Set(result.rows.map((row) => String(row.code).trim().toUpperCase()));
  const eligibleRows = keyed.filter(({ code }) => eligibleCodes.has(code)).map(({ row }) => row);
  return {
    rows: eligibleRows,
    requestedCount: rows.length,
    eligibleCount: eligibleRows.length,
    excludedCount: rows.length - eligibleRows.length,
  };
}

export function sanitizeKisUsConditionRaw(raw: Record<string, unknown> | null, eligibleRows: Record<string, unknown>[]) {
  if (!raw) return null;
  return {
    rt_cd: raw.rt_cd ?? null,
    msg_cd: raw.msg_cd ?? null,
    msg1: raw.msg1 ?? null,
    output1: raw.output1 ?? null,
    output2: eligibleRows,
  };
}
