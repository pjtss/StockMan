import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { secXbrlSnapshots } from "./schema";
import { archiveSecSourceSnapshot } from "./source-payload-archive";
import type { SecCompanyFactsResponse } from "./sec-company-facts-collector";

export type SecCompanyFactsWriters = {
  archive: (input: {
    sourceType: string;
    sourceKey: string;
    url: string;
    status: number;
    responseHeaders: Record<string, string>;
    rawPayload: string;
    fetchedAt: string;
  }) => Promise<number | string | null>;
  upsertSnapshot: (input: { cik: string; payload: Record<string, unknown>; fetchedAt: Date }) => Promise<void>;
};

const databaseWriters: SecCompanyFactsWriters = {
  archive: archiveSecSourceSnapshot,
  async upsertSnapshot(input) {
    await getDb().insert(secXbrlSnapshots).values(input).onConflictDoUpdate({
      target: secXbrlSnapshots.cik,
      set: { payload: input.payload, fetchedAt: input.fetchedAt },
    });
  },
};

export async function loadSecCompanyFactsSnapshot(cik: string) {
  const normalizedCik = cik.replace(/\D/g, "").padStart(10, "0");
  const rows = await getDb().select().from(secXbrlSnapshots).where(eq(secXbrlSnapshots.cik, normalizedCik)).limit(1);
  return rows[0] || null;
}

/** Persist both the exact response body and parsed complete JSON snapshot. */
export async function persistSecCompanyFacts(source: SecCompanyFactsResponse, cik: string, writers: SecCompanyFactsWriters = databaseWriters) {
  const sourceKey = cik.replace(/\D/g, "").padStart(10, "0");
  const archivedId = await writers.archive({
    sourceType: "COMPANY_FACTS",
    sourceKey,
    url: source.url,
    status: source.status,
    responseHeaders: source.responseHeaders,
    rawPayload: source.rawText,
    fetchedAt: source.fetchedAt,
  });
  await writers.upsertSnapshot({ cik: sourceKey, payload: source.data, fetchedAt: new Date(source.fetchedAt) });
  return { cik: sourceKey, archivedId, fetchedAt: source.fetchedAt };
}
