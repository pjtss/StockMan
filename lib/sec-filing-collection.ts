export type FilingCollectionCandidate = { accession: string; form: string; primaryTextPresent: boolean };

export type FilingCollectionDependencies = {
  loadSubmissions: (cik: string) => Promise<FilingCollectionCandidate[]>;
  collectDocument: (accession: string) => Promise<{ ok: boolean; error?: string }>;
};

export type FilingCollectionResult = {
  cik: string;
  considered: number;
  skippedCached: number;
  collected: number;
  failed: Array<{ accession: string; error: string }>;
};

/**
 * Collects missing FORM bodies only. It never classifies, scores, or analyzes
 * the filing; those responsibilities belong to the Codex analysis stage.
 */
export async function collectMissingSecFilingDocuments(cik: string, dependencies: FilingCollectionDependencies): Promise<FilingCollectionResult> {
  const filings = await dependencies.loadSubmissions(cik);
  const result: FilingCollectionResult = { cik, considered: filings.length, skippedCached: 0, collected: 0, failed: [] };
  for (const filing of filings) {
    if (filing.primaryTextPresent) {
      result.skippedCached++;
      continue;
    }
    const captured = await dependencies.collectDocument(filing.accession);
    if (captured.ok) result.collected++;
    else result.failed.push({ accession: filing.accession, error: captured.error || "document_collection_failed" });
  }
  return result;
}
