import { and, asc, desc, eq, gte, isNull, lt, ne, or, sql } from "drizzle-orm";
import { getDb } from "./db";
import { marketRssArticles } from "./schema";
import { fetchAllMarketRss, type MarketRssSource } from "./market-rss-sources";
import { fetchAllDomesticRss } from "./domestic-rss-sources";
import { MARKET_RSS_TRANSLATION_CONCURRENCY, translateMarketRssItem } from "./translate-market-rss-item";
import { CloudTranslationClient } from "./cloud-translation-client";
import { classifyMarketRssItem } from "./market-rss-classifier";
import { extractSecCik, resolvePreferredSecCompanyTickers } from "./sec-company-ticker";
import { loadFeatureDiscordDebugWebhook, loadFeatureDiscordWebhook } from "./discord-config";
import { enqueueDiscordDelivery } from "./discord-delivery-queue";
import { buildMarketRssQueueEnqueueFailureState, getMarketRssDiscordPerMinuteLimit, isRetryableDiscordError, marketRssDeliveryExternalId, withDiscordWaitParameter } from "./discord-delivery-policy";
import { archiveMarketRssFeed } from "./source-payload-archive";
import { dedupeMarketRssItems } from "./market-rss-dedupe";
import type { TranslationClient, TranslationResult, TranslationLanguage } from "./translation-types";
import { claimTranslationLimitAlert, claimTranslationThresholdAlert, loadTranslationCache, recordTranslatedCharacters, releaseTranslationCharacters, reserveTranslationCharacters, saveTranslationCache } from "./translation-cache";
import { DISCORD_SUPPRESS_EMBEDS_FLAG } from "./market-rss-discord-message";

const articleAgeLimitMs = () => Number(process.env.RSS_MAX_ARTICLE_AGE_MINUTES || 15) * 60_000;

export async function ingestMarketRssArticles(options?: { sources?: MarketRssSource[] }) {
  const db = getDb();
  const [fetched, domesticFetched] = await Promise.all([
    fetchAllMarketRss(options?.sources),
    fetchAllDomesticRss(),
  ]);
  const allResults = [...fetched.results, ...domesticFetched.results];
  const secItems = allResults.find((result) => result.ok && result.source === "SEC_EDGAR");
  const secCiks = secItems?.ok ? secItems.feed.items.map((item) => extractSecCik(item.title)).filter(Boolean) : [];
  let secTickerMap = new Map<string, string>();
  if (secCiks.length) {
    try { secTickerMap = new Map((await resolvePreferredSecCompanyTickers(secCiks)).map((row) => [row.cik, row.ticker])); } catch { secTickerMap = new Map(); }
  }
  let inserted = 0;
  const duplicateCounts = new Map<string, number>();
  for (const result of allResults) {
    if (!result.ok) continue;
    const sourceSnapshotId = await archiveMarketRssFeed(result.feed);
    const { items, duplicateCount } = dedupeMarketRssItems(result.feed.items);
    duplicateCounts.set(result.source, duplicateCount);
    const values = items.map((item) => {
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
      return {
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
      };
    });
    if (values.length === 0) continue;
    const rows = await db.insert(marketRssArticles).values(values).onConflictDoUpdate({ target: [marketRssArticles.source, marketRssArticles.externalId], set: {
        title: sql`excluded.title`, summary: sql`excluded.summary`, content: sql`excluded.content`, rawPayload: sql`excluded.raw_payload`, sourceSnapshotId: sql`excluded.source_snapshot_id`, detectedTicker: sql`excluded.detected_ticker`, eventDirection: sql`excluded.event_direction`, matchedTerms: sql`excluded.matched_terms`, financingAmountUsd: sql`excluded.financing_amount_usd`, dilutionRisk: sql`excluded.dilution_risk`,
        ...buildMarketRssTranslationUpsertReset(),
        link: buildMarketRssLinkUpsertValue(),
        publishedAt: sql`COALESCE(${marketRssArticles.publishedAt}, excluded.published_at)`,
        category: sql`excluded.category`, priority: sql`excluded.priority`,
        notifyEligible: sql`excluded.notify_eligible`,
        // Backlog is an ingestion-time fact.  A later RSS refresh must not
        // turn an already delivered article into a backlog item merely
        // because the article is now older than RSS_MAX_ARTICLE_AGE_MINUTES.
        isBacklog: sql`CASE WHEN ${marketRssArticles.notificationStatus} = 'PENDING' THEN excluded.is_backlog ELSE ${marketRssArticles.isBacklog} END`, updatedAt: new Date(),
      }}).returning({ id: marketRssArticles.id });
      return { duplicateCount, inserted: rows.length };
    });
    if (!outcome.ok) {
      ingestOutcomes.set(result.source, { ok: false, error: outcome.error });
      continue;
    }
    ingestOutcomes.set(result.source, { ok: true });
    duplicateCounts.set(result.source, outcome.value.duplicateCount);
    inserted += outcome.value.inserted;
  }
  return { fetchedAt: fetched.fetchedAt, sourceResults: allResults.map((item) => ({ source: item.source, ok: item.ok, skipped: "skipped" in item ? item.skipped : false, count: item.ok ? item.feed.items.length : 0, duplicateCount: duplicateCounts.get(item.source) ?? 0 })), inserted };
}

export async function translatePendingMarketRssArticles(limit = 10) {
  const db = getDb();
  const client = CloudTranslationClient.fromEnvironment();
  if (!client) return { attempted: 0, translated: 0, cached: 0, fallback: 0, failed: 0, skipped: true, reason: "cloud_translation_not_configured" };
  const rows = await db.select().from(marketRssArticles).where(and(eq(marketRssArticles.source, "STOCKTITAN"), or(eq(marketRssArticles.translationStatus, "PENDING"), and(eq(marketRssArticles.translationStatus, "FAILED"), lt(marketRssArticles.translationAttempts, 3))), eq(marketRssArticles.notifyEligible, true), eq(marketRssArticles.isBacklog, false))).orderBy(desc(marketRssArticles.priority), asc(marketRssArticles.createdAt)).limit(limit);
  const cachedClient: TranslationClient = { translate: async (text: string, source: TranslationLanguage = "en", target: TranslationLanguage = "ko"): Promise<TranslationResult> => {
    const provider = "google-cloud-translation";
    const cached = await loadTranslationCache(text, provider, target);
    if (cached) return { translatedText: cached.translatedText, source, target, provider, fallback: false };
    const reservation = await reserveTranslationCharacters(text.length);
    if (!reservation.allowed) {
      for (let threshold = 100000; threshold <= reservation.used; threshold += 100000) {
        if (await claimTranslationThresholdAlert(threshold)) thresholdAlerts.add(threshold);
      }
    });
    return { attempted: rows.length, translated: 0, notRequired, fallback, failed: 0, fallbackReasons: countMarketRssTranslationFallbackReasons(fallbackReasonCodes), skipped: fallback > 0, ...(fallback ? { reason: "cloud_translation_not_configured" } : {}) };
  }
  const thresholdAlertsByMonth = new Map<string, Set<number>>();
  const limitReachedMonths = new Set<string>();
  const tracked = createQuotaAwareTranslationClient(client, async (used, month, quotaExceeded) => {
    if (quotaExceeded) limitReachedMonths.add(month);
    const monthThresholds = thresholdAlertsByMonth.get(month) || new Set<number>();
    for (let threshold = 100000; threshold <= used; threshold += 100000) {
      monthThresholds.add(threshold);
    }
    if (monthThresholds.size) thresholdAlertsByMonth.set(month, monthThresholds);
  }, undefined, { deferCacheWriteUntilValidated: true });
  const cachedClient = tracked.client;
  let translated = 0;
  let notRequired = 0;
  let fallback = 0;
  let failed = 0;
  const fallbackReasonCodes: Array<string | undefined> = [];
  await mapWithConcurrency(rows, MARKET_RSS_TRANSLATION_CONCURRENCY, async (row) => {
    let result: Awaited<ReturnType<typeof translateMarketRssItem>>;
    try {
      const result = await translateMarketRssItem({ id: row.externalId, title: row.title, summary: row.summary, content: (row as any).content || undefined, link: row.link, publishedAt: row.publishedAt?.toISOString() ?? null, source: row.source }, cachedClient);
      await db.update(marketRssArticles).set({ translatedTitle: result.translatedTitle, translatedSummary: result.translatedSummary, translatedContent: result.translatedContent ?? null, translationProvider: "google-cloud-translation", translationCharCount: result.title.length, translationSkippedReason: result.translationFallbackReason ?? null, translationTranslatedAt: result.translationFallback ? null : new Date(), translationFallback: result.translationFallback, translationError: result.translationFallbackReason || null, translationAttempts: row.translationAttempts + 1, translationStatus: result.translationFallback ? "SKIPPED" : "TRANSLATED", updatedAt: new Date() }).where(eq(marketRssArticles.id, row.id));
      translated++;
      if (result.translationFallback) {
        fallback++;
        const reason = result.translationFallbackReason || "unknown";
        fallbackReasons[reason] = (fallbackReasons[reason] || 0) + 1;
        if (reason === "monthly_character_limit_reached") limitReached = true;
      }
    } catch (error) {
      failed++;
      const failedAt = new Date();
      const failureFallback = makeMarketRssTranslationFailureFallback(row, error, failedAt, error instanceof TranslationClientOperationError && error.stage === "provider_request");
      fallbackReasonCodes.push(failureFallback.translationSkippedReason);
      await db.update(marketRssArticles).set({
        ...failureFallback,
        translationAttemptedAt: failedAt,
      }).where(eq(marketRssArticles.id, row.id));
      return;
    }

    // Keep persistence outside the provider catch: a DB write failure is a
    // pipeline failure, not a translation API failure, and must not overwrite
    // the diagnostic with a misleading fallback state.
    const processedAt = new Date();
    await db.update(marketRssArticles).set(buildMarketRssTranslationPersistence(row, result, processedAt)).where(eq(marketRssArticles.id, row.id));
    if (result.translationNotRequired) notRequired++;
    else if (result.translationFallback) {
      fallback++;
      fallbackReasonCodes.push(result.translationFallbackReason);
    } else translated++;
  });
  const limitReached = limitReachedMonths.size > 0;
  let limitAlertSent = false;
  if (limitReached) {
    const webhook = await loadFeatureDiscordDebugWebhook("market-rss", ["STOCKMAN_DEBUG_DISCORD_WEBHOOK_URL"]);
    if (webhook) {
      for (const month of [...limitReachedMonths].sort()) {
        const sent = await sendClaimedTranslationUsageAlert(
          () => claimTranslationLimitAlert(month),
          async () => {
            const response = await fetch(withDiscordWaitParameter(webhook), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ content: `⚠️ Cloud Translation 번역 중지\n사유: ${month} 월간 공백 포함 문자 한도(${(300000).toLocaleString()}자) 도달\n대상: StockTitan RSS`, allowed_mentions: { parse: [] } }), signal: AbortSignal.timeout(8_000) }).catch(() => null);
            return Boolean(response?.ok);
          },
          () => releaseTranslationLimitAlert(month),
        );
        if (sent) limitAlertSent = true;
      }
    }
  }
  let thresholdAlertSent = 0;
  const thresholdAlerts = new Set([...thresholdAlertsByMonth.values()].flatMap((monthThresholds) => [...monthThresholds]));
  const thresholdWebhook = thresholdAlerts.size ? await loadFeatureDiscordDebugWebhook("market-rss", ["STOCKMAN_DEBUG_DISCORD_WEBHOOK_URL"]) : null;
  if (thresholdWebhook) {
    for (const [month, monthThresholds] of [...thresholdAlertsByMonth].sort(([left], [right]) => left.localeCompare(right))) {
      for (const threshold of [...monthThresholds].sort((a, b) => a - b)) {
        const sent = await sendClaimedTranslationUsageAlert(
          () => claimTranslationThresholdAlert(threshold, month),
          async () => {
            const response = await fetch(withDiscordWaitParameter(thresholdWebhook), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ content: `ℹ️ Cloud Translation 누적 사용량 알림\n기준 월: ${month} · 누적 번역량 ${threshold.toLocaleString()}자 이상\n대상: StockTitan RSS`, allowed_mentions: { parse: [] } }), signal: AbortSignal.timeout(8_000) }).catch(() => null);
            return Boolean(response?.ok);
          },
          () => releaseTranslationThresholdAlert(threshold, month),
        );
        if (sent) thresholdAlertSent++;
      }
    }
  }
  return { attempted: rows.length, translated, notRequired, fallback, failed, fallbackReasons: countMarketRssTranslationFallbackReasons(fallbackReasonCodes), translationUsage: tracked.getMetrics(), limitReached, limitAlertSent, thresholdAlerts: [...thresholdAlerts].sort((a, b) => a - b), thresholdAlertSent };
}

export async function notifyPendingMarketRssArticles(limit = 10) {
  const webhook = await loadFeatureDiscordWebhook("market-rss", ["MARKET_RSS_DISCORD_WEBHOOK_URL"]);
  if (!webhook) return { attempted: 0, sent: 0, skipped: true, reason: "webhook_not_configured" };
  const db = getDb();
  const now = Date.now();
  const staleCutoff = new Date(now - articleAgeLimitMs());
  const staleLeaseCutoff = new Date(now - 10 * 60_000);
  await db.update(marketRssArticles).set({ notificationStatus: "PENDING", lastError: "stale_processing_recovered", updatedAt: new Date() }).where(and(eq(marketRssArticles.notificationStatus, "PROCESSING"), lt(marketRssArticles.updatedAt, staleLeaseCutoff)));
  await db.update(marketRssArticles).set({ notificationStatus: "UNCERTAIN", lastError: "stale_sending_outcome_unknown", updatedAt: new Date() }).where(and(eq(marketRssArticles.notificationStatus, "SENDING"), lt(marketRssArticles.updatedAt, staleLeaseCutoff)));
  await db.update(marketRssArticles).set({ notificationStatus: "SKIPPED", lastError: "backlog_or_stale_article", updatedAt: new Date() }).where(and(eq(marketRssArticles.notificationStatus, "PENDING"), ne(marketRssArticles.source, "STOCKTITAN"), or(eq(marketRssArticles.isBacklog, true), lt(marketRssArticles.publishedAt, staleCutoff))));
  const rows = await db.select().from(marketRssArticles).where(and(eq(marketRssArticles.notificationStatus, "PENDING"), eq(marketRssArticles.notifyEligible, true), buildMarketRssNotificationTranslationGate(), or(eq(marketRssArticles.source, "STOCKTITAN"), eq(marketRssArticles.isBacklog, false)), or(eq(marketRssArticles.source, "STOCKTITAN"), or(isNull(marketRssArticles.publishedAt), gte(marketRssArticles.publishedAt, staleCutoff))))).orderBy(desc(marketRssArticles.priority), asc(marketRssArticles.publishedAt)).limit(limit);
  const perMinuteLimit = getMarketRssDiscordPerMinuteLimit();
  const recent = await db.select({ count: sql<number>`count(*)` }).from(marketRssArticles).where(buildMarketRssNotificationRateWindowCondition(new Date(now - 60_000)));
  let remaining = Math.max(0, perMinuteLimit - Number(recent[0]?.count || 0));
  let sent = 0;
  let queueEnqueueFailed = 0;
  for (const row of rows) {
    if (remaining <= 0) break;
    const title = row.translatedTitle || row.title;
    const isStockTitan = row.source === "STOCKTITAN";
    const titleLine = row.link ? `[**${title}**](${row.link})` : `**${title}**`;
    const body = [
      titleLine,
      row.publishedAt ? `발행: ${row.publishedAt.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}` : "",
    ].filter(Boolean).join("\n");
    try {
      const response = await fetch(`${webhook}?wait=true`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ content: body, allowed_mentions: { parse: [] }, flags: DISCORD_SUPPRESS_EMBEDS_FLAG }), signal: AbortSignal.timeout(8_000) });
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
          externalId: marketRssDeliveryExternalId(row.id, attempt),
          channelKey: "MARKET_RSS",
          payload: { ...payload, _marketRssSnapshot: createMarketRssNotificationSnapshot(row) },
        });
      },
      markQueueEnqueueFailed: async (attempt, error) => {
        await db.update(marketRssArticles).set({
          ...buildMarketRssQueueEnqueueFailureState(attempt, error),
          updatedAt: new Date(),
        }).where(eq(marketRssArticles.id, row.id));
      },
      markSent: async (attempt) => {
        // Persist outside the webhook catch. If Discord accepted the message but
        // this write fails, SENDING is retained and later quarantined; never auto-queue a possible duplicate.
        await db.update(marketRssArticles).set({ notificationStatus: "SENT", notificationAttempts: attempt, notifiedAt: new Date(), lastError: null, updatedAt: new Date() }).where(eq(marketRssArticles.id, row.id));
      },
    });
    if (!delivery.claimedForSend) continue;
    remaining--;
    if (delivery.sent) sent++;
    if (delivery.queueEnqueueFailed) queueEnqueueFailed++;
  }
  return { attempted: rows.length, sent, queueEnqueueFailed, skipped: false, perMinuteLimit, remainingAfterSend: remaining, webhookConfigured: true };
}
