import { asc, eq } from "drizzle-orm";
import { getDb } from "./db";
import { marketRssArticles } from "./schema";
import { fetchAllMarketRss } from "./market-rss-sources";
import { translateMarketRssItem } from "./translate-market-rss-item";
import { LibreTranslateClient } from "./libretranslate-client";

export async function ingestMarketRssArticles() {
  const db = getDb();
  const fetched = await fetchAllMarketRss();
  let inserted = 0;
  for (const result of fetched.results) {
    if (!result.ok) continue;
    for (const item of result.feed.items) {
      const rows = await db.insert(marketRssArticles).values({
        source: item.source,
        externalId: item.id,
        title: item.title,
        summary: item.summary,
        link: item.link,
        publishedAt: item.publishedAt ? new Date(item.publishedAt) : null,
      }).onConflictDoNothing().returning({ id: marketRssArticles.id });
      inserted += rows.length;
    }
  }
  return { fetchedAt: fetched.fetchedAt, sourceResults: fetched.results.map((item) => ({ source: item.source, ok: item.ok, count: item.ok ? item.feed.items.length : 0 })), inserted };
}

export async function translatePendingMarketRssArticles(limit = 10) {
  const db = getDb();
  const rows = await db.select().from(marketRssArticles).where(eq(marketRssArticles.translationStatus, "PENDING")).orderBy(asc(marketRssArticles.createdAt)).limit(limit);
  const client = new LibreTranslateClient();
  let translated = 0;
  for (const row of rows) {
    try {
      const result = await translateMarketRssItem({ id: row.externalId, title: row.title, summary: row.summary, link: row.link, publishedAt: row.publishedAt?.toISOString() ?? null, source: row.source }, client);
      await db.update(marketRssArticles).set({ translatedTitle: result.translatedTitle, translatedSummary: result.translatedSummary, translationFallback: result.translationFallback, translationStatus: result.translationFallback ? "FALLBACK" : "TRANSLATED", updatedAt: new Date() }).where(eq(marketRssArticles.id, row.id));
      translated++;
    } catch (error) {
      await db.update(marketRssArticles).set({ translationStatus: "FAILED", lastError: error instanceof Error ? error.message : String(error), updatedAt: new Date() }).where(eq(marketRssArticles.id, row.id));
    }
  }
  return { attempted: rows.length, translated };
}

export async function notifyPendingMarketRssArticles(limit = 10) {
  const webhook = process.env.MARKET_RSS_DISCORD_WEBHOOK_URL;
  if (!webhook) return { attempted: 0, sent: 0, skipped: true, reason: "webhook_not_configured" };
  const db = getDb();
  const rows = await db.select().from(marketRssArticles).where(eq(marketRssArticles.notificationStatus, "PENDING")).orderBy(asc(marketRssArticles.createdAt)).limit(limit);
  let sent = 0;
  for (const row of rows) {
    const body = [
      `**${row.translatedTitle || row.title}**`,
      row.translatedSummary || row.summary,
      row.link ? `[원문 보기](${row.link})` : "",
      `출처: ${row.source}${row.translationFallback ? " · 번역 fallback" : ""}`,
    ].filter(Boolean).join("\n");
    try {
      const response = await fetch(`${webhook}?wait=true`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ content: body }) });
      if (!response.ok) throw new Error(`Discord HTTP ${response.status}`);
      await db.update(marketRssArticles).set({ notificationStatus: "SENT", notificationAttempts: row.notificationAttempts + 1, notifiedAt: new Date(), lastError: null, updatedAt: new Date() }).where(eq(marketRssArticles.id, row.id));
      sent++;
    } catch (error) {
      await db.update(marketRssArticles).set({ notificationStatus: "FAILED", notificationAttempts: row.notificationAttempts + 1, lastError: error instanceof Error ? error.message : String(error), updatedAt: new Date() }).where(eq(marketRssArticles.id, row.id));
    }
  }
  return { attempted: rows.length, sent, skipped: false };
}
