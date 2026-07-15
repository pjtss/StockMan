import { getAccessToken, refreshAccessToken } from "@/lib/kis";
import { loadKisApiConfig } from "@/lib/kis-api-config";
import { buildKisAuthorization, isKisTokenExpiredResponse } from "@/lib/kis-authorization";

export type KisUsPriceDetailRequest = { code: string; market?: string };

export type KisUsPriceDetailResult = {
  ok: boolean;
  status: number;
  code: string;
  market: string;
  parsed: unknown;
};

function parseJson(rawText: string) {
  try { return JSON.parse(rawText); } catch { return null; }
}

export async function fetchKisUsPriceDetail({ code: rawCode, market: rawMarket = "AMS" }: KisUsPriceDetailRequest): Promise<KisUsPriceDetailResult | null> {
  const code = rawCode.trim().toUpperCase();
  const market = rawMarket.trim().toUpperCase();
  const config = await loadKisApiConfig("us_price_detail");
  const params = new URLSearchParams({ AUTH: "", EXCD: market, SYMB: code });
  const url = `https://openapi.koreainvestment.com:9443/uapi/overseas-price/v1/quotations/price-detail?${params.toString()}`;
  const headers = (token: string) => ({
    "content-type": config.content_type || "application/json; charset=utf-8",
    Authorization: buildKisAuthorization(token),
    appkey: process.env.KIS_APPKEY || "",
    appsecret: process.env.KIS_APPSECRET || "",
    tr_id: config.tr_id || "HHDFS76200200",
    custtype: config.custtype || "P",
    tr_cont: "",
  });

  async function fetchOnce(token: string) {
    const response = await fetch(url, { method: "GET", headers: headers(token) });
    const rawText = await response.text();
    return { response, parsed: parseJson(rawText) };
  }

  let token = await getAccessToken();
  if (!token) return null;
  let result = await fetchOnce(token);
  if (isKisTokenExpiredResponse(result.response.status, result.parsed)) {
    token = await refreshAccessToken();
    if (!token) return null;
    result = await fetchOnce(token);
  }
  return { ok: result.response.ok, status: result.response.status, code, market, parsed: result.parsed };
}

export function getKisUsPriceDetailOutput(parsed: unknown): Record<string, unknown> {
  const value = (parsed as any)?.output ?? (parsed as any)?.output1 ?? (parsed as any)?.output2 ?? {};
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
