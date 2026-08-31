import { and, asc, desc, eq, gte, isNull, lt, ne, or, sql } from "drizzle-orm";
import { getDb } from "./db";
import { marketRssArticles } from "./schema";
import { fetchAllMarketRss, type MarketRssSource } from "./market-rss-sources";
import { translateMarketRssItem } from "./translate-market-rss-item";
import { CloudTranslationClient } from "./cloud-translation-client";
import { classifyMarketRssItem } from "./market-rss-classifier";
import { resolveSingleMarketNewsReaction } from "./market-news-market-reaction";
import { extractSecCik, resolvePreferredSecCompanyTickers } from "./sec-company-ticker";
import { loadFeatureDiscordDebugWebhook, loadFeatureDiscordWebhook } from "./discord-config";
import { enqueueDiscordDelivery } from "./discord-delivery-queue";
import { isRetryableDiscordError, marketRssDeliveryExternalId } from "./discord-delivery-policy";
import { archiveMarketRssFeed } from "./source-payload-archive";
import type { TranslationClient, TranslationResult, TranslationLanguage } from "./translation-types";
import { claimTranslationLimitAlert, loadTranslationCache, reserveTranslationCharacters, saveTranslationCache } from "./translation-cache";

const articleAgeLimitMs = () => Number(process.env.RSS_MAX_ARTICLE_AGE_MINUTES || 15) * 60_000;

export async function ingestMarketRssArticles(options?: { sources?: MarketRssSource[] }) {
  const db = getDb();
  const fetched = await fetchAllMarketRss(options?.sources);
  const secItems = fetched.results.find((result) => result.ok && result.source === "SEC_EDGAR");
  const secCiks = secItems?.ok ? secItems.feed.items.map((item) => extractSecCik(item.title)).filter(Boolean) : [];
  let secTickerMap = new Map<string, string>();
  if (secCiks.length) {
    try { secTickerMap = new Map((await resolvePreferredSecCompanyTickers(secCiks)).map((row) => [row.cik, row.ticker])); } catch { secTickerMap = new Map(); }
  }
  let inserted = 0;
  for (const result of fetched.results) {
    if (!result.ok) continue;
    const sourceSnapshotId = await archiveMarketRssFeed(result.feed);
    for (const item of result.feed.items) {
      const classification = classifyMarketRssItem(item);
      const mappedTicker = item.source === "SEC_EDGAR" ? secTickerMap.get(extractSecCik(item.title)) || null : null;
      // SEC filings without a preferred common-share mapping (for example
      // trusts, units and warrants) cannot produce a useful stock alert.
      // Keep the filing for diagnostics, but suppress the notification.
      // StockTitan is an explicit publisher feed requested for full delivery:
      // every item is notification-eligible, while other sources keep their
      // classifier and SEC ticker safeguards.
      const notifyEligible = item.source === "STOCKTITAN" || (classification.notifyEligible && (item.source !== "SEC_EDGAR" || Boolean(mappedTicker)));
      const publishedAt = item.publishedAt ? new Date(item.publishedAt) : null;
      const isBacklog = item.source === "STOCKTITAN" ? false : Boolean(publishedAt && Date.now() - publishedAt.getTime() > articleAgeLimitMs());
      const rows = await db.insert(marketRssArticles).values({
        source: item.source,
        externalId: item.id,
        title: item.title,
        summary: item.summary,
        content: item.content ?? "",
        rawPayload: item.raw == null ? null : JSON.stringify(item.raw),
        sourceSnapshotId,
        detectedTicker: classification.ticker || mappedTicker,
        eventDirection: classification.direction,
        matchedTerms: classification.matchedTerms,
        financingAmountUsd: classification.financingAmountUsd,
        dilutionRisk: classification.dilutionRisk,
        link: item.link,
        publishedAt,
        category: classification.category,
        priority: classification.priority,
        notifyEligible,
        isBacklog,
      }).onConflictDoUpdate({ target: [marketRssArticles.source, marketRssArticles.externalId], set: {
        title: sql`excluded.title`, summary: sql`excluded.summary`, content: sql`excluded.content`, rawPayload: sql`excluded.raw_payload`, sourceSnapshotId: sql`excluded.source_snapshot_id`, detectedTicker: sql`excluded.detected_ticker`, eventDirection: sql`excluded.event_direction`, matchedTerms: sql`excluded.matched_terms`, financingAmountUsd: sql`excluded.financing_amount_usd`, dilutionRisk: sql`excluded.dilution_risk`,
        link: sql`CASE WHEN ${marketRssArticles.link} = '' THEN excluded.link ELSE ${marketRssArticles.link} END`,
        publishedAt: sql`COALESCE(${marketRssArticles.publishedAt}, excluded.published_at)`,
        category: sql`excluded.category`, priority: sql`excluded.priority`,
        notifyEligible: sql`excluded.notify_eligible`,
        // Backlog is an ingestion-time fact.  A later RSS refresh must not
        // turn an already delivered article into a backlog item merely
        // because the article is now older than RSS_MAX_ARTICLE_AGE_MINUTES.
        isBacklog: sql`CASE WHEN ${marketRssArticles.notificationStatus} = 'PENDING' THEN excluded.is_backlog ELSE ${marketRssArticles.isBacklog} END`, updatedAt: new Date(),
      }}).returning({ id: marketRssArticles.id });
      inserted += rows.length;
    }
  }
  return { fetchedAt: fetched.fetchedAt, sourceResults: fetched.results.map((item) => ({ source: item.source, ok: item.ok, count: item.ok ? item.feed.items.length : 0 })), inserted };
}

export async function translatePendingMarketRssArticles(limit = 10) {
  const db = getDb();
  const client = CloudTranslationClient.fromEnvironment();
  if (!client) return { attempted: 0, translated: 0, cached: 0, fallback: 0, failed: 0, skipped: true, reason: "cloud_translation_not_configured" };
  const rows = await db.select().from(marketRssArticles).where(and(eq(marketRssArticles.translationStatus, "PENDING"), eq(marketRssArticles.notifyEligible, true), eq(marketRssArticles.isBacklog, false))).orderBy(desc(marketRssArticles.priority), asc(marketRssArticles.createdAt)).limit(limit);
  const cachedClient: TranslationClient = { translate: async (text: string, source: TranslationLanguage = "en", target: TranslationLanguage = "ko"): Promise<TranslationResult> => {
    const provider = "google-cloud-translation";
    const cached = await loadTranslationCache(text, provider, target);
    if (cached) return { translatedText: cached.translatedText, source, target, provider, fallback: false };
    const reservation = await reserveTranslationCharacters(text.length);
    if (!reservation.allowed) return { translatedText: text, source, target, provider, fallback: true, fallbackReason: "monthly_character_limit_reached" };
    const result = await client.translate(text, source, target);
    if (!result.fallback) await saveTranslationCache(text, result.translatedText, provider, source, target);
    return result;
  } };
  let translated = 0;
  let fallback = 0;
  let failed = 0;
  let limitReached = false;
  const fallbackReasons: Record<string, number> = {};
  for (const row of rows) {
    try {
      const result = await translateMarketRssItem({ id: row.externalId, title: row.title, summary: row.summary, content: (row as any).content || undefined, link: row.link, publishedAt: row.publishedAt?.toISOString() ?? null, source: row.source }, cachedClient);
      await db.update(marketRssArticles).set({ translatedTitle: result.translatedTitle, translatedSummary: result.translatedSummary, translatedContent: result.translatedContent ?? null, translationProvider: "google-cloud-translation", translationCharCount: result.title.length + result.summary.length + (result.content?.length ?? 0), translationSkippedReason: result.translationFallbackReason ?? null, translationTranslatedAt: result.translationFallback ? null : new Date(), translationFallback: result.translationFallback, translationError: result.translationFallbackReason || null, translationAttempts: row.translationAttempts + 1, translationStatus: result.translationFallback ? "SKIPPED" : "TRANSLATED", updatedAt: new Date() }).where(eq(marketRssArticles.id, row.id));
      translated++;
      if (result.translationFallback) {
        fallback++;
        const reason = result.translationFallbackReason || "unknown";
        fallbackReasons[reason] = (fallbackReasons[reason] || 0) + 1;
        if (reason === "monthly_character_limit_reached") limitReached = true;
      }
    } catch (error) {
      failed++;
      await db.update(marketRssArticles).set({ translationStatus: "FAILED", translationAttempts: row.translationAttempts + 1, translationError: error instanceof Error ? error.message : String(error), updatedAt: new Date() }).where(eq(marketRssArticles.id, row.id));
    }
  }
  let limitAlertSent = false;
  if (limitReached && await claimTranslationLimitAlert()) {
    const webhook = await loadFeatureDiscordDebugWebhook("market-rss", ["STOCKMAN_DEBUG_DISCORD_WEBHOOK_URL"]);
    if (webhook) {
      const response = await fetch(`${webhook}${webhook.includes("?") ? "&" : "?"}wait=true`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ content: `⚠️ Cloud Translation 번역 중지\n사유: 월간 공백 포함 문자 한도(${(300000).toLocaleString()}자) 도달\n대상: StockTitan RSS` }) }).catch(() => null);
      limitAlertSent = Boolean(response?.ok);
    }
  }
  return { attempted: rows.length, translated, fallback, failed, fallbackReasons, limitReached, limitAlertSent };
}

export async function notifyPendingMarketRssArticles(limit = 10) {
  const webhook = await loadFeatureDiscordWebhook("market-rss", ["MARKET_RSS_DISCORD_WEBHOOK_URL"]);
  if (!webhook) return { attempted: 0, sent: 0, skipped: true, reason: "webhook_not_configured" };
  const db = getDb();
  const now = Date.now();
  const staleCutoff = new Date(now - articleAgeLimitMs());
  await db.update(marketRssArticles).set({ notificationStatus: "SKIPPED", lastError: "backlog_or_stale_article", updatedAt: new Date() }).where(and(eq(marketRssArticles.notificationStatus, "PENDING"), ne(marketRssArticles.source, "STOCKTITAN"), or(eq(marketRssArticles.isBacklog, true), lt(marketRssArticles.publishedAt, staleCutoff))));
  const rows = await db.select().from(marketRssArticles).where(and(eq(marketRssArticles.notificationStatus, "PENDING"), eq(marketRssArticles.notifyEligible, true), or(eq(marketRssArticles.source, "STOCKTITAN"), eq(marketRssArticles.isBacklog, false)), or(eq(marketRssArticles.source, "STOCKTITAN"), or(isNull(marketRssArticles.publishedAt), gte(marketRssArticles.publishedAt, staleCutoff))))).orderBy(desc(marketRssArticles.priority), asc(marketRssArticles.publishedAt)).limit(limit);
  const perMinuteLimit = Math.max(1, Number(process.env.RSS_DISCORD_PER_MINUTE || 5));
  const recent = await db.select({ count: sql<number>`count(*)` }).from(marketRssArticles).where(and(eq(marketRssArticles.notificationStatus, "SENT"), gte(marketRssArticles.notifiedAt, new Date(now - 60_000))));
  let remaining = Math.max(0, perMinuteLimit - Number(recent[0]?.count || 0));
  let sent = 0;
  for (const row of rows) {
    if (remaining <= 0) break;
    const title = row.translatedTitle || row.title;
    const reaction = row.detectedTicker ? await resolveSingleMarketNewsReaction(row.detectedTicker) : null;
    const titleLine = row.link ? `[**${title}**](${row.link})` : `**${title}**`;
    const body = [
      "🚨 **해외시장 RSS 속보**",
      titleLine,
      row.translatedTitle && row.translatedTitle !== row.title ? `원문 제목: ${row.title}` : "",
      row.publishedAt ? `발행: ${row.publishedAt.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}` : "",
      `출처: ${row.source}${row.translationFallback ? " · 번역 fallback" : ""}`,
      row.detectedTicker ? `티커: ${row.detectedTicker}${reaction?.exchange ? ` · ${reaction.exchange}` : ""}` : "",
      reaction?.ok ? `등락률: ${reaction.rate ?? "-"}% · 거래대금: ${reaction.tradingValue ?? "-"}달러` : "",
    ].filter(Boolean).join("\n");
    try {
      const response = await fetch(`${webhook}?wait=true`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ content: body }) });
      if (!response.ok) throw new Error(`Discord HTTP ${response.status}`);
      await db.update(marketRssArticles).set({ notificationStatus: "SENT", notificationAttempts: row.notificationAttempts + 1, notifiedAt: new Date(), lastError: null, updatedAt: new Date() }).where(eq(marketRssArticles.id, row.id));
      sent++;
      remaining--;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const nextAttempt = row.notificationAttempts + 1;
      await db.update(marketRssArticles).set({ notificationStatus: "FAILED", notificationAttempts: nextAttempt, lastError: message, updatedAt: new Date() }).where(eq(marketRssArticles.id, row.id));
      if (isRetryableDiscordError(error)) {
        await enqueueDiscordDelivery({
          externalId: marketRssDeliveryExternalId(row.id, nextAttempt),
          channelKey: "MARKET_RSS",
          payload: { content: body, allowed_mentions: { parse: [] } },
        });
      }
    }
  }
  return { attempted: rows.length, sent, skipped: false, perMinuteLimit, remainingAfterSend: remaining, webhookConfigured: true };
}
