import { createSecRequestHeaders } from "./sec-request-headers";

export const SEC_DATA_BASE_URL = "https://data.sec.gov";
export const SEC_WEB_BASE_URL = "https://www.sec.gov";

export type SecHttpResult<T> = { ok: true; status: number; url: string; data: T; rawText: string; fetchedAt: string; responseHeaders: Record<string, string> } | { ok: false; status: number; url: string; error: string; rawText: string; fetchedAt: string };

function baseUrl() { return (process.env.SEC_API_BASE_URL || SEC_DATA_BASE_URL).replace(/\/$/, ""); }
function timeoutMs() { return Math.max(1000, Number(process.env.SEC_REQUEST_TIMEOUT_MS || 15000)); }
let nextRequestAt = 0;
async function waitForSecRateLimit() {
  const maxPerSecond = Math.max(1, Number(process.env.SEC_MAX_REQUESTS_PER_SECOND || 8));
  const spacing = 1000 / maxPerSecond;
  const now = Date.now();
  const wait = Math.max(0, nextRequestAt - now);
  nextRequestAt = Math.max(now, nextRequestAt) + spacing;
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
}

export async function fetchSecJson<T>(path: string, init: RequestInit = {}): Promise<SecHttpResult<T>> {
  const url = path.startsWith("http") ? path : `${baseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
  const fetchedAt = new Date().toISOString();
  try {
    await waitForSecRateLimit();
    const response = await fetch(url, { ...init, headers: { ...createSecRequestHeaders("application/json"), ...(init.headers || {}) }, cache: "no-store", signal: init.signal || AbortSignal.timeout(timeoutMs()) });
    const rawText = await response.text();
    if (!response.ok) return { ok: false, status: response.status, url, error: `SEC HTTP ${response.status}`, rawText, fetchedAt };
    try { return { ok: true, status: response.status, url, data: JSON.parse(rawText) as T, rawText, fetchedAt, responseHeaders: Object.fromEntries(response.headers.entries()) }; }
    catch { return { ok: false, status: response.status, url, error: "SEC returned invalid JSON", rawText, fetchedAt }; }
  } catch (error) { return { ok: false, status: 0, url, error: error instanceof Error ? error.message : String(error), rawText: "", fetchedAt }; }
}

export function submissionsUrl(cik: string) { return `/submissions/CIK${cik.replace(/\D/g, "").padStart(10, "0")}.json`; }
export function companyFactsUrl(cik: string) { return `/api/xbrl/companyfacts/CIK${cik.replace(/\D/g, "").padStart(10, "0")}.json`; }
export function companyConceptUrl(cik: string, taxonomy: string, tag: string) { return `/api/xbrl/companyconcept/CIK${cik.replace(/\D/g, "").padStart(10, "0")}/${encodeURIComponent(taxonomy)}/${encodeURIComponent(tag)}.json`; }
export function xbrlFrameUrl(taxonomy: string, tag: string, unit: string, frame: string) { return `/api/xbrl/frames/${encodeURIComponent(taxonomy)}/${encodeURIComponent(tag)}/${encodeURIComponent(unit)}/${encodeURIComponent(frame)}.json`; }
