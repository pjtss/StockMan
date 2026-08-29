import { loadKisApiConfig, type KisApiConfig } from "@/lib/kis-api-config";
import { getAccessToken } from "@/lib/kis";
import { kisRequest } from "@/lib/kis-request-framework";

export type KisUsTopRisingApiRequest = {
  excd?: string;
  gubn?: string;
  nday?: string;
  volRang?: string;
};

export type KisUsTopRisingApiResponse = {
  ok: boolean;
  status: number;
  url: string;
  request: {
    method: "GET";
    headers: Record<string, string>;
  };
  response: {
    rawText: string;
    parsed: unknown;
  };
};

export type KisUsTopRisingApiContext = {
  config: KisApiConfig;
  token: string;
  request: Required<KisUsTopRisingApiRequest>;
};

function buildTargetUrl(request: Required<KisUsTopRisingApiRequest>) {
  const params = new URLSearchParams({
    KEYB: "",
    AUTH: "",
    EXCD: request.excd,
    GUBN: request.gubn,
    NDAY: request.nday,
    VOL_RANG: request.volRang,
  });
  return `https://openapi.koreainvestment.com:9443/uapi/overseas-stock/v1/ranking/updown-rate?${params.toString()}`;
}

function parseResponse(rawText: string) {
  try {
    return JSON.parse(rawText);
  } catch {
    return null;
  }
}

export async function prepareKisUsTopRisingApi(request: KisUsTopRisingApiRequest = {}) {
  const config = await loadKisApiConfig("us_updown_rate");
  const token = await getAccessToken();
  if (!token) return null;

  const resolvedRequest: Required<KisUsTopRisingApiRequest> = {
    excd: request.excd || config.EXCD || "AMS",
    gubn: request.gubn || config.GUBN || "1",
    nday: request.nday || config.NDAY || "0",
    volRang: request.volRang || config.VOL_RANG || "5",
  };

  return {
    config,
    token,
    request: resolvedRequest,
    url: buildTargetUrl(resolvedRequest),
  } satisfies KisUsTopRisingApiContext & { url: string };
}

export async function fetchKisUsTopRisingApi(request: KisUsTopRisingApiRequest = {}) {
  const prepared = await prepareKisUsTopRisingApi(request);
  if (!prepared) {
    return null;
  }

  const responseResult = await kisRequest<any>({ url: prepared.url, token: prepared.token, trId: prepared.config.tr_id || "HHDFS76290000", headers: { "content-type": prepared.config.content_type || "application/json; charset=utf-8", custtype: prepared.config.custtype || "P", tr_cont: "" } });
  const { response, rawText } = responseResult;
  return {
    ok: response.ok,
    status: response.status,
    url: prepared.url,
    request: {
      method: "GET" as const,
      headers: {
        authorization: "Bearer <masked>",
        appkey: "<masked>",
        appsecret: "<masked>",
        "content-type": prepared.config.content_type || "application/json; charset=utf-8",
        tr_id: prepared.config.tr_id || "HHDFS76290000",
        custtype: prepared.config.custtype || "P",
        tr_cont: "",
      },
    },
      response: {
      rawText,
      parsed: responseResult.parsed ?? parseResponse(rawText),
    },
  } satisfies KisUsTopRisingApiResponse;
}
