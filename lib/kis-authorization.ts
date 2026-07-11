type KisErrorBody = {
  msg_cd?: unknown;
};

export function buildKisAuthorization(token: string) {
  return `Bearer ${token.trim()}`;
}

export function isKisTokenExpiredResponse(status: number, body: KisErrorBody | null | undefined) {
  return status === 401 || String(body?.msg_cd ?? "").trim() === "EGW00123";
}

export function isKisTokenExpiredErrorMessage(message: string) {
  return message.includes("[EGW00123]") || /HTTP\s+401\b/i.test(message);
}
