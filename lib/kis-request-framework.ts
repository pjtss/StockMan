import { buildKisAuthorization } from "@/lib/kis-authorization";
import { classifyKisFailure, withKisRequestThrottle } from "@/lib/kis-request-throttle";
import { createDebugContext } from "@/lib/debug-context";
import { writeDebugLog } from "@/lib/debug-logger";
import { recordDebugKisCall } from "@/lib/debug-kis-call";

export type KisRequestOptions = { url: string | URL; token: string; trId: string; method?: "GET" | "POST"; headers?: Record<string, string>; timeoutMs?: number; body?: string; debug?: { feature?: string; market?: "KR" | "US" | string; code?: string; timeframe?: string } };
export type KisResponse<T = any> = { response: Response; rawText: string; parsed: T | null };
const DEFAULT_TIMEOUT_MS = 15_000;

export function buildKisHeaders(token: string, trId: string, extra: Record<string, string> = {}) {
  return { "content-type": "application/json", Authorization: buildKisAuthorization(token), appkey: process.env.KIS_APPKEY?.trim() ?? "", appsecret: process.env.KIS_APPSECRET?.trim() ?? "", tr_id: trId, custtype: "P", ...extra };
}

/** Standard KIS HTTP boundary: headers, timeout, TPS throttle, retry and JSON parsing. */
export async function kisRequest<T = any>(options: KisRequestOptions): Promise<KisResponse<T>> {
  const startedAt = Date.now();
  const url = new URL(options.url);
  const context = createDebugContext({ feature: options.debug?.feature ?? "kis-api", market: options.debug?.market, code: options.debug?.code, timeframe: options.debug?.timeframe });
  const result = await withKisRequestThrottle(async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(1_000, options.timeoutMs ?? DEFAULT_TIMEOUT_MS));
    try {
      const response = await fetch(options.url, { method: options.method ?? "GET", headers: buildKisHeaders(options.token, options.trId, options.headers), body: options.body, signal: controller.signal, cache: "no-store" });
      const rawText = await response.text();
      let parsed: T | null = null;
      try { parsed = JSON.parse(rawText) as T; } catch {}
      if (!response.ok) writeDebugLog("WARN", "kis_api_http_error", context, { endpoint: url.pathname, trId: options.trId, httpStatus: response.status, durationMs: Date.now() - startedAt, retryable: response.status === 429 || response.status >= 500 });
      return { response, rawText, parsed };
    } catch (error) {
      writeDebugLog("ERROR", "kis_api_request_error", context, { endpoint: url.pathname, trId: options.trId, durationMs: Date.now() - startedAt, retryable: true, error: error instanceof Error ? error.message : String(error) });
      throw error;
    } finally { clearTimeout(timer); }
  }, context);
  const failure = classifyKisFailure(result);
  await recordDebugKisCall({ context, endpoint: url.pathname, trId: options.trId, httpStatus: result.response.status, failure, durationMs: Date.now() - startedAt, retryable: failure === "RATE_LIMITED" || failure === "TRANSIENT_HTTP" || failure === "AUTH_EXPIRED" });
  if (failure) writeDebugLog(failure === "PERMANENT" ? "ERROR" : "WARN", "kis_api_business_error", context, { endpoint: url.pathname, trId: options.trId, failure, httpStatus: result.response.status, durationMs: Date.now() - startedAt, retryable: failure === "RATE_LIMITED" || failure === "TRANSIENT_HTTP" || failure === "AUTH_EXPIRED" });
  return result;
}
