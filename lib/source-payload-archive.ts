import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "./db";
import { marketRssFetchSnapshots, secFilingDocuments, secSourceSnapshots } from "./schema";
import type { MarketRssFeed } from "./market-rss";

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/**
 * Stores the exact RSS response once per source/content hash. Repeated cron
 * polls of an unchanged feed do not create duplicate large rows.
 */
export async function archiveMarketRssFeed(feed: MarketRssFeed) {
  if (!feed.rawPayload) return null;
  const db = getDb();
  const contentHash = sha256(feed.rawPayload);
  const existing = await db.select({ id: marketRssFetchSnapshots.id })
    .from(marketRssFetchSnapshots)
    .where(and(eq(marketRssFetchSnapshots.source, feed.source), eq(marketRssFetchSnapshots.contentHash, contentHash)))
    .limit(1);
  if (existing[0]) return existing[0].id;
  const inserted = await db.insert(marketRssFetchSnapshots).values({
    source: feed.source,
    url: feed.url,
    status: feed.responseStatus || 200,
    responseHeaders: feed.responseHeaders || {},
    rawPayload: feed.rawPayload,
    contentHash,
    itemCount: feed.items.length,
    fetchedAt: new Date(feed.fetchedAt),
  }).onConflictDoNothing({ target: [marketRssFetchSnapshots.source, marketRssFetchSnapshots.contentHash] }).returning({ id: marketRssFetchSnapshots.id });
  return inserted[0]?.id || null;
}

export async function archiveSecSourceSnapshot(input: {
  sourceType: string;
  sourceKey: string;
  url: string;
  status: number;
  responseHeaders?: Record<string, string>;
  rawPayload: string;
  fetchedAt: string;
}) {
  const db = getDb();
  const contentHash = sha256(input.rawPayload);
  const existing = await db.select({ id: secSourceSnapshots.id })
    .from(secSourceSnapshots)
    .where(and(
      eq(secSourceSnapshots.sourceType, input.sourceType),
      eq(secSourceSnapshots.sourceKey, input.sourceKey),
      eq(secSourceSnapshots.contentHash, contentHash),
    ))
    .limit(1);
  if (existing[0]) return existing[0].id;
  const inserted = await db.insert(secSourceSnapshots).values({
    sourceType: input.sourceType,
    sourceKey: input.sourceKey,
    url: input.url,
    status: input.status,
    responseHeaders: input.responseHeaders || {},
    rawPayload: input.rawPayload,
    contentHash,
    fetchedAt: new Date(input.fetchedAt),
  }).onConflictDoNothing({ target: [secSourceSnapshots.sourceType, secSourceSnapshots.sourceKey, secSourceSnapshots.contentHash] }).returning({ id: secSourceSnapshots.id });
  return inserted[0]?.id || null;
}

export async function archiveSecFilingDocument(input: {
  accession: string;
  cik: string;
  form: string;
  indexUrl: string;
  primaryUrl: string;
  indexHtml: string;
  primaryHtml: string;
  primaryText: string;
  fetchedAt: string;
}) {
  const db = getDb();
  await db.insert(secFilingDocuments).values({
    accession: input.accession,
    cik: input.cik,
    form: input.form,
    indexUrl: input.indexUrl,
    primaryUrl: input.primaryUrl,
    indexHtml: input.indexHtml,
    primaryHtml: input.primaryHtml,
    primaryText: input.primaryText,
    fetchedAt: new Date(input.fetchedAt),
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: secFilingDocuments.accession,
    set: {
      cik: input.cik,
      form: input.form,
      indexUrl: input.indexUrl,
      primaryUrl: input.primaryUrl,
      indexHtml: input.indexHtml,
      primaryHtml: input.primaryHtml,
      primaryText: input.primaryText,
      fetchedAt: new Date(input.fetchedAt),
      updatedAt: new Date(),
    },
  });
}
