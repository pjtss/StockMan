import crypto from "node:crypto";

const secret = () => process.env.CRON_SECRET || process.env.ADMIN_DASHBOARD_PASSWORD || "";
export function createBbExportToken(market: "KR" | "US" | "ALL", expiresAt: number) {
  const payload = `${market}.${expiresAt}`;
  return `${expiresAt}.${crypto.createHmac("sha256", secret()).update(payload).digest("hex")}`;
}
export function verifyBbExportToken(market: string, token: string | null) {
  if (!token) return false;
  const [expires, signature] = token.split("."); const expiresAt = Number(expires);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now() || !signature) return false;
  const expected = crypto.createHmac("sha256", secret()).update(`${market}.${expiresAt}`).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
