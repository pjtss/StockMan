import crypto from "node:crypto";

export type KisRealtimeMarket = "KR" | "US";
export type KisRealtimeChannel = "trade" | "asking";
export type KisRealtimeSubscription = { market: KisRealtimeMarket; channel: KisRealtimeChannel; code: string; exchange?: "NAS" | "NYS" | "AMS" };

const REAL_WS_URL = "wss://ops.koreainvestment.com:21000";
const PAPER_WS_URL = "wss://ops.koreainvestment.com:31000";
const TR_IDS: Record<KisRealtimeMarket, Record<KisRealtimeChannel, string>> = {
  KR: { trade: "H0STCNT0", asking: "H0STASP0" },
  US: { trade: "HDFSCNT0", asking: "HDFSASP0" },
};

export function getKisRealtimeTrId(subscription: KisRealtimeSubscription) {
  return TR_IDS[subscription.market][subscription.channel];
}

export function getKisRealtimeKey(subscription: KisRealtimeSubscription) {
  const code = subscription.code.trim().toUpperCase();
  if (subscription.market === "US") return `${subscription.exchange ?? "NAS"}${code}`;
  return code;
}

export function buildKisRealtimeFrame(input: { approvalKey: string; subscription: KisRealtimeSubscription; action?: "subscribe" | "unsubscribe" }) {
  const action = input.action === "unsubscribe" ? "2" : "1";
  return JSON.stringify({ header: { approval_key: input.approvalKey, custtype: "P", tr_type: action, content_type: "utf-8" }, body: { input: { tr_id: getKisRealtimeTrId(input.subscription), tr_key: getKisRealtimeKey(input.subscription) } } });
}

export async function issueKisRealtimeApprovalKey(input: { appKey?: string; appSecret?: string; paper?: boolean } = {}) {
  const appKey = input.appKey?.trim() || process.env.KIS_APPKEY?.trim();
  const appSecret = input.appSecret?.trim() || process.env.KIS_APPSECRET?.trim();
  if (!appKey || !appSecret) return null;
  const baseUrl = input.paper ? "https://openapivts.koreainvestment.com:29443" : "https://openapi.koreainvestment.com:9443";
  const response = await fetch(`${baseUrl}/oauth2/Approval`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ grant_type: "client_credentials", appkey: appKey, secretkey: appSecret }), signal: AbortSignal.timeout(8_000) });
  const parsed = await response.json().catch(() => null) as { approval_key?: string } | null;
  return response.ok && parsed?.approval_key ? parsed.approval_key : null;
}

export function getKisRealtimeUrl(paper = false) {
  return paper ? PAPER_WS_URL : REAL_WS_URL;
}

export function parseKisRealtimeEnvelope(raw: string) {
  try {
    const parsed = JSON.parse(raw) as { header?: Record<string, unknown>; body?: Record<string, unknown> };
    return { kind: "json" as const, header: parsed.header ?? {}, body: parsed.body ?? {} };
  } catch {
    const [encrypted, trId, _, payload] = raw.split("|");
    return { kind: "data" as const, encrypted: encrypted === "1", trId: trId ?? "", values: payload ? payload.split("^") : [] };
  }
}

export function makeRealtimeClientId() {
  return crypto.randomUUID();
}
