import { collectSecCompanyFacts, type SecCompanyFactsFetch } from "./sec-company-facts-collector";
import { persistSecCompanyFacts, type SecCompanyFactsWriters } from "./sec-company-facts-persistence";

/** Application service that fetches and stores an unmodified SEC Company Facts response. */
export async function syncSecCompanyFacts(cik: string, dependencies: {
  fetchJson?: SecCompanyFactsFetch;
  writers?: SecCompanyFactsWriters;
} = {}) {
  const source = await collectSecCompanyFacts(cik, dependencies.fetchJson);
  if (!source.ok) return { ok: false as const, cik: source.cik, status: source.status, error: source.error };
  const saved = await persistSecCompanyFacts(source, source.cik, dependencies.writers);
  const taxonomies = (source.data.facts as Record<string, Record<string, unknown>> | undefined) || {};
  return {
    ok: true as const,
    cik: saved.cik,
    status: source.status,
    url: source.url,
    fetchedAt: source.fetchedAt,
    archivedId: saved.archivedId,
    factCount: Object.values(taxonomies).reduce((total, taxonomy) => total + Object.keys(taxonomy || {}).length, 0),
    entityName: typeof source.data.entityName === "string" ? source.data.entityName : null,
    taxonomyCount: Object.keys(taxonomies).length,
  };
}
