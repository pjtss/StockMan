import { companyFactsUrl, fetchSecJson, type SecHttpResult } from "./sec-edgar-client";

export type SecCompanyFactsPayload = Record<string, unknown>;
export type SecCompanyFactsResponse = Extract<SecHttpResult<SecCompanyFactsPayload>, { ok: true }>;

export type SecCompanyFactsFetch = (path: string) => Promise<SecHttpResult<SecCompanyFactsPayload>>;

/** Fetches the complete SEC Company Facts response without reshaping its fields. */
export async function collectSecCompanyFacts(cik: string, fetchJson: SecCompanyFactsFetch = fetchSecJson) {
  const digits = cik.replace(/\D/g, "");
  if (digits.length < 1 || digits.length > 10) {
    const normalizedCik = digits.padStart(10, "0");
    return { ok: false as const, cik: normalizedCik, error: "invalid_cik", status: 0 };
  }
  const normalizedCik = digits.padStart(10, "0");
  const source = await fetchJson(companyFactsUrl(normalizedCik));
  if (!source.ok) return { ...source, cik: normalizedCik };
  return { ...source, cik: normalizedCik };
}
