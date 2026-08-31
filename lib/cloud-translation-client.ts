import crypto from "node:crypto";
import type { TranslationClient, TranslationLanguage, TranslationResult } from "./translation-types";

type ServiceAccount = { client_email?: string; private_key?: string; project_id?: string };
const b64 = (value: string | Uint8Array) => Buffer.from(value).toString("base64url");

export class CloudTranslationClient implements TranslationClient {
  private token: { value: string; expiresAt: number } | null = null;
  constructor(private readonly account: ServiceAccount, private readonly projectId = process.env.GOOGLE_CLOUD_PROJECT_ID || account.project_id || "", private readonly location = process.env.GOOGLE_CLOUD_LOCATION || "global") {}
  static fromEnvironment() {
    const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (!raw) return null;
    try { const account = JSON.parse(raw) as ServiceAccount; if (!account.client_email || !account.private_key || !account.project_id && !process.env.GOOGLE_CLOUD_PROJECT_ID) return null; return new CloudTranslationClient(account); } catch { return null; }
  }
  private async accessToken() {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;
    const now = Math.floor(Date.now() / 1000);
    const header = b64(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const claim = b64(JSON.stringify({ iss: this.account.client_email, scope: "https://www.googleapis.com/auth/cloud-translation", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
    const signer = crypto.createSign("RSA-SHA256"); signer.update(`${header}.${claim}`); signer.end();
    const assertion = `${header}.${claim}.${b64(signer.sign(this.account.private_key!))}`;
    const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }) });
    if (!response.ok) throw new Error(`Cloud Translation auth HTTP ${response.status}`);
    const body = await response.json() as { access_token?: string; expires_in?: number }; if (!body.access_token) throw new Error("Cloud Translation auth response missing access_token");
    this.token = { value: body.access_token, expiresAt: Date.now() + Number(body.expires_in || 3600) * 1000 }; return body.access_token;
  }
  async translate(text: string, source: TranslationLanguage = "en", target: TranslationLanguage = "ko"): Promise<TranslationResult> {
    if (!text.trim()) return { translatedText: "", source, target, provider: "google-cloud-translation", fallback: false };
    const response = await fetch(`https://translation.googleapis.com/v3/projects/${encodeURIComponent(this.projectId)}/locations/${encodeURIComponent(this.location)}:translateText`, { method: "POST", headers: { Authorization: `Bearer ${await this.accessToken()}`, "content-type": "application/json" }, body: JSON.stringify({ sourceLanguageCode: source, targetLanguageCode: target, mimeType: "text/plain", contents: [text] }), signal: AbortSignal.timeout(Number(process.env.CLOUD_TRANSLATION_TIMEOUT_MS || 15000)) });
    if (!response.ok) throw new Error(`Cloud Translation HTTP ${response.status}`);
    const body = await response.json() as { translations?: Array<{ translatedText?: string }> }; const translatedText = body.translations?.[0]?.translatedText;
    if (!translatedText) throw new Error("Cloud Translation response missing translatedText");
    return { translatedText, source, target, provider: "google-cloud-translation", fallback: false };
  }
}
