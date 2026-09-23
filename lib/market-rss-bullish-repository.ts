import { and, asc, eq, gt, sql } from "drizzle-orm";
import { getDb } from "./db";
import { marketRssArticles, marketRssBullishArticles } from "./schema";
import { classifyMarketRssItem } from "./market-rss-classifier";

const BATCH_SIZE = 500;

export async function syncMarketRssBullishArticles() {
  const db = getDb();
  let cursor = 0;
  let scanned = 0;
  let stored = 0;
  let removed = 0;
  while (true) {
    const rows = await db.select().from(marketRssArticles).where(gt(marketRssArticles.id, cursor)).orderBy(asc(marketRssArticles.id)).limit(BATCH_SIZE);
    if (!rows.length) break;
    cursor = rows.at(-1)!.id;
    scanned += rows.length;
    for (const row of rows) {
      const classification = classifyMarketRssItem({ source: row.source, title: row.title, summary: row.summary });
      if (!classification.notifyEligible) {
        const deleted = await db.delete(marketRssBullishArticles).where(eq(marketRssBullishArticles.sourceArticleId, row.id)).returning({ id: marketRssBullishArticles.id });
        removed += deleted.length;
        continue;
      }
      await db.insert(marketRssBullishArticles).values({
        source: row.source,
        externalId: row.externalId,
        sourceArticleId: row.id,
        title: row.title,
        translatedTitle: row.translatedTitle,
        summary: row.summary,
        translatedSummary: row.translatedSummary,
        content: row.content,
        link: row.link,
        publishedAt: row.publishedAt,
        ticker: classification.ticker || row.detectedTicker,
        category: classification.category,
        direction: classification.direction,
        matchedTerms: classification.matchedTerms,
        priority: classification.priority,
        financingAmountUsd: classification.financingAmountUsd,
        dilutionRisk: classification.dilutionRisk,
        translationStatus: row.translationStatus,
        translationFallback: row.translationFallback,
        translationError: row.translationError,
        analyzedAt: new Date(),
        updatedAt: new Date(),
      }).onConflictDoUpdate({
        target: [marketRssBullishArticles.source, marketRssBullishArticles.externalId],
        set: {
          sourceArticleId: row.id,
          title: row.title,
          translatedTitle: row.translatedTitle,
          summary: row.summary,
          translatedSummary: row.translatedSummary,
          content: row.content,
          link: row.link,
          publishedAt: row.publishedAt,
          ticker: classification.ticker || row.detectedTicker,
          category: classification.category,
          direction: classification.direction,
          matchedTerms: classification.matchedTerms,
          priority: classification.priority,
          financingAmountUsd: classification.financingAmountUsd,
          dilutionRisk: classification.dilutionRisk,
          translationStatus: row.translationStatus,
          translationFallback: row.translationFallback,
          translationError: row.translationError,
          analyzedAt: new Date(),
          updatedAt: new Date(),
        },
      });
      stored++;
    }
  }
  return { scanned, stored, removed, batchSize: BATCH_SIZE, noExternalLimit: true };
}

export async function listMarketRssBullishArticles(options?: { source?: string; limit?: number }) {
  const db = getDb();
  const conditions = options?.source ? eq(marketRssBullishArticles.source, options.source) : undefined;
  return db.select().from(marketRssBullishArticles).where(conditions).orderBy(sql`${marketRssBullishArticles.publishedAt} DESC NULLS LAST`, sql`${marketRssBullishArticles.priority} DESC`, sql`${marketRssBullishArticles.id} DESC`).limit(Math.min(Math.max(options?.limit ?? 200, 1), 1000));
}
