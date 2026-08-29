import { buildKisAuthorization } from "@/lib/kis-authorization";
import { withKisRequestThrottle } from "@/lib/kis-request-throttle";

export type KisRequestOptions = { url: string | URL; token: string; trId: string; method?: "GET" | "POST"; headers?: Record<string, string>; timeoutMs?: number; body?: string };
export type KisResponse<T = any> = { response: Response; rawText: string; parsed: T | null };
const DEFAULT_TIMEOUT_MS = 15_000;

export function buildKisHeaders(token: string, trId: string, extra: Record<string, string> = {}) {
  return { "content-type": "application/json", Authorization: buildKisAuthorization(token), appkey: process.env.KIS_APPKEY?.trim() ?? "", appsecret: process.env.KIS_APPSECRET?.trim() ?? "", tr_id: trId, custtype: "P", ...extra };
}

/** Standard KIS HTTP boundary: headers, timeout, TPS throttle, retry and JSON parsing. */
export async function kisRequest<T = any>(options: KisRequestOptions): Promise<KisResponse<T>> {
  return withKisRequestThrottle(async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(1_000, options.timeoutMs ?? DEFAULT_TIMEOUT_MS));
    try {
      const response = await fetch(options.url, { method: options.method ?? "GET", headers: buildKisHeaders(options.token, options.trId, options.headers), body: options.body, signal: controller.signal, cache: "no-store" });
      const rawText = await response.text();
      let parsed: T | null = null;
      try { parsed = JSON.parse(rawText) as T; } catch {}
      return { response, rawText, parsed };
    } finally { clearTimeout(timer); }
  });
}
