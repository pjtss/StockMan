import { and, asc, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import { getDb } from "./db";
import { marketRssArticles } from "./schema";
import { fetchAllMarketRss, type MarketRssSource } from "./market-rss-sources";
import { MARKET_RSS_TRANSLATION_CONCURRENCY, translateMarketRssItem } from "./translate-market-rss-item";
import { classifyMarketRssItem } from "./market-rss-classifier";
import { resolveSingleMarketNewsReaction } from "./market-news-market-reaction";
import { extractSecCik, resolvePreferredSecCompanyTickers } from "./sec-company-ticker";
import { loadFeatureDiscordDebugWebhook, loadFeatureDiscordWebhook } from "./discord-config";
import { enqueueDiscordDelivery } from "./discord-delivery-queue";
import { buildMarketRssQueueEnqueueFailureState, createDiscordHttpError, isRetryableDiscordError, marketRssDeliveryExternalId, withDiscordWaitParameter } from "./discord-delivery-policy";
import { archiveMarketRssFeed } from "./source-payload-archive";
import { dedupeMarketRssItems } from "./market-rss-dedupe";
import { buildMarketRssTranslationRetryCondition, getMarketRssTranslationRetryCriteria, makeMarketRssTranslationFailureFallback } from "./market-rss-translation-retry";
import { buildMarketRssTranslationPersistence } from "./market-rss-translation-persistence";
import { buildMarketRssDiscordNotificationPayload } from "./market-rss-notification-message";
import { deliverMarketRssDiscordNotification } from "./market-rss-notification-delivery";
import { toTextWebhookPayload } from "./discord-text";
import { createMarketRssTranslationClient } from "./market-rss-translation-client";
import { AZURE_TRANSLATION_MONTHLY_LIMIT, AZURE_TRANSLATION_PROVIDER, TRANSLATION_LIMIT } from "./translation-cache";
import { claimTranslationLimitAlert, claimTranslationThresholdAlert, releaseTranslationLimitAlert, releaseTranslationThresholdAlert } from "./translation-cache";
import { sendClaimedTranslationUsageAlert } from "./translation-usage-alert";
import { buildMarketRssNotificationClaimCondition, buildMarketRssNotificationTranslationGate } from "./market-rss-notification-translation-gate";
import { createMarketRssNotificationSnapshot } from "./market-rss-notification-snapshot";
import { runMarketRssIngestSource } from "./market-rss-ingest-outcome";
import { buildMarketRssLinkUpsertValue, buildMarketRssTranslationUpsertReset } from "./market-rss-translation-upsert";
import { mapWithConcurrency } from "./map-with-concurrency";
import { countMarketRssTranslationFallbackReasons } from "./market-rss-translation-fallback-count";
import { TranslationClientOperationError } from "./translation-types";
import { MARKET_RSS_DISCORD_ALLOWED_SOURCES } from "./market-rss-discord-policy";
import { interleaveMarketRssSourceQueues } from "./market-rss-source-fairness";

export async function ingestMarketRssArticles(options?: { sources?: MarketRssSource[] }) {
  const db = getDb();
  const fetched = await fetchAllMarketRss(options?.sources);
  const allResults = fetched.results;
  const secItems = allResults.find((result) => result.ok && result.source === "SEC_EDGAR");
  const secCiks = secItems?.ok ? secItems.feed.items.map((item) => extractSecCik(item.title)).filter(Boolean) : [];
  let secTickerMap = new Map<string, string>();
  if (secCiks.length) {
    try { secTickerMap = new Map((await resolvePreferredSecCompanyTickers(secCiks)).map((row) => [row.cik, row.ticker])); } catch { secTickerMap = new Map(); }
  }
  let inserted = 0;
  const duplicateCounts = new Map<string, number>();
  const ingestOutcomes = new Map<string, { ok: true } | { ok: false; error: ReturnType<typeof import("./error-diagnostics").describeError> }>();
  for (const result of allResults) {
    if (!result.ok) continue;
    if ("skipped" in result && result.skipped) continue;
    const outcome = await runMarketRssIngestSource(result.source, async () => {
      const sourceSnapshotId = await archiveMarketRssFeed(result.feed);
      const { items, duplicateCount } = dedupeMarketRssItems(result.feed.items);
      const values = items.map((item) => {
        const classification = classifyMarketRssItem(item);
        const mappedTicker = item.source === "SEC_EDGAR" ? secTickerMap.get(extractSecCik(item.title)) || null : null;
        const notifyEligible = true;
        const publishedAt = item.publishedAt ? new Date(item.publishedAt) : null;
        const isBacklog = false;
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
      if (values.length === 0) return { duplicateCount, inserted: 0 };
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
  const sourceResults = allResults.map((item) => {
    const skipped = "skipped" in item && item.skipped;
    const ingestOutcome = ingestOutcomes.get(item.source);
    const ingestStatus = !item.ok ? "FETCH_FAILED" : skipped ? "SKIPPED" : ingestOutcome?.ok === false ? "PERSIST_FAILED" : "STORED";
    return {
      source: item.source,
      ok: item.ok && ingestOutcome?.ok !== false,
      skipped,
      ingestStatus,
      ...(!item.ok ? { ingestError: { errorCode: "RSS_FETCH_FAILED" } } : ingestOutcome?.ok === false ? { ingestError: {
        errorCode: ingestOutcome.error.errorCode,
        ...(ingestOutcome.error.databaseCode ? { databaseCode: ingestOutcome.error.databaseCode } : {}),
        ...(ingestOutcome.error.table ? { table: ingestOutcome.error.table } : {}),
        ...(ingestOutcome.error.column ? { column: ingestOutcome.error.column } : {}),
        ...(ingestOutcome.error.constraint ? { constraint: ingestOutcome.error.constraint } : {}),
      } } : {}),
      count: item.ok ? item.feed.items.length : 0,
      duplicateCount: duplicateCounts.get(item.source) ?? 0,
    };
  });
  const ingestFailureCount = sourceResults.filter((item) => item.ingestStatus === "FETCH_FAILED" || item.ingestStatus === "PERSIST_FAILED").length;
  return { fetchedAt: fetched.fetchedAt, sourceResults, ingestFailureCount, inserted };
}

export async function translatePendingMarketRssArticles(limit = 10) {
  const db = getDb();
  const providerSet = createMarketRssTranslationClient({ deferCacheWriteUntilValidated: true });
  const client = providerSet.client;
  const retryCriteria = getMarketRssTranslationRetryCriteria(Boolean(client));
  const candidates = and(
    buildMarketRssTranslationRetryCondition(retryCriteria),
    inArray(marketRssArticles.source, [...MARKET_RSS_DISCORD_ALLOWED_SOURCES]),
  );
  // Drain historical backlog first so a continuous stream of new articles
  // cannot starve older pending titles and notifications.
  const sourceQueues = await Promise.all(MARKET_RSS_DISCORD_ALLOWED_SOURCES.map((source) => db.select().from(marketRssArticles).where(and(candidates, eq(marketRssArticles.source, source))).orderBy(asc(marketRssArticles.createdAt), desc(marketRssArticles.priority)).limit(limit)));
  const fairRows = interleaveMarketRssSourceQueues(sourceQueues, limit);
  if (!client) {
    let notRequired = 0;
    let fallback = 0;
    const fallbackReasonCodes: Array<string | undefined> = [];
    await mapWithConcurrency(fairRows, MARKET_RSS_TRANSLATION_CONCURRENCY, async (row) => {
      const result = await translateMarketRssItem({ id: row.externalId, title: row.title, summary: row.summary, content: (row as any).content || undefined, link: row.link, publishedAt: row.publishedAt?.toISOString() ?? null, source: row.source });
      const processedAt = new Date();
      await db.update(marketRssArticles).set(buildMarketRssTranslationPersistence(row, result, processedAt)).where(eq(marketRssArticles.id, row.id));
      if (result.translationNotRequired) notRequired++;
      else if (result.translationFallback) {
        fallback++;
        fallbackReasonCodes.push(result.translationFallbackReason);
      }
    });
    return { attempted: fairRows.length, translated: 0, notRequired, fallback, failed: 0, fallbackReasons: countMarketRssTranslationFallbackReasons(fallbackReasonCodes), skipped: fallback > 0, ...(fallback ? { reason: "cloud_translation_not_configured" } : {}) };
  }
  const thresholdAlertsByMonth = new Map<string, Set<number>>();
  const limitReachedMonths = new Set<string>();
  const tracked = createMarketRssTranslationClient({ deferCacheWriteUntilValidated: true }, async (used, month, quotaExceeded, provider, reason) => {
    if (quotaExceeded && reason === "monthly_character_limit_reached") limitReachedMonths.add(`${provider}:${month}`);
    if (reason === "hourly_character_limit_reached") return;
    const key = `${provider}:${month}`;
    const monthThresholds = thresholdAlertsByMonth.get(key) || new Set<number>();
    for (let threshold = 100000; threshold <= used; threshold += 100000) {
      monthThresholds.add(threshold);
    }
    if (monthThresholds.size) thresholdAlertsByMonth.set(key, monthThresholds);
  });
  const cachedClient = tracked.client;
  let translated = 0;
  let notRequired = 0;
  let fallback = 0;
  let failed = 0;
  const fallbackReasonCodes: Array<string | undefined> = [];
  await mapWithConcurrency(fairRows, MARKET_RSS_TRANSLATION_CONCURRENCY, async (row) => {
    let result: Awaited<ReturnType<typeof translateMarketRssItem>>;
    try {
      result = await translateMarketRssItem({ id: row.externalId, title: row.title, summary: row.summary, content: (row as any).content || undefined, link: row.link, publishedAt: row.publishedAt?.toISOString() ?? null, source: row.source }, cachedClient ?? undefined);
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
      for (const key of [...limitReachedMonths].sort()) {
        const [provider, month] = key.split(":");
        const providerLabel = provider === AZURE_TRANSLATION_PROVIDER ? "Azure Translator F0" : "Google Cloud Translation";
        const providerLimit = provider === AZURE_TRANSLATION_PROVIDER ? AZURE_TRANSLATION_MONTHLY_LIMIT : TRANSLATION_LIMIT;
        const sent = await sendClaimedTranslationUsageAlert(
          () => claimTranslationLimitAlert(month, provider),
          async () => {
            const response = await fetch(withDiscordWaitParameter(webhook), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ content: `⚠️ ${providerLabel} 번역 중지\n사유: ${month} 앱 내부 월간 입력문자 상한(${providerLimit.toLocaleString()}자) 도달\n대상: StockTitan RSS`, allowed_mentions: { parse: [] } }), signal: AbortSignal.timeout(8_000) }).catch(() => null);
            return Boolean(response?.ok);
          },
          () => releaseTranslationLimitAlert(month, provider),
        );
        if (sent) limitAlertSent = true;
      }
    }
  }
  let thresholdAlertSent = 0;
  const thresholdAlerts = new Set([...thresholdAlertsByMonth.values()].flatMap((monthThresholds) => [...monthThresholds]));
  const thresholdWebhook = thresholdAlerts.size ? await loadFeatureDiscordDebugWebhook("market-rss", ["STOCKMAN_DEBUG_DISCORD_WEBHOOK_URL"]) : null;
  if (thresholdWebhook) {
    for (const [key, monthThresholds] of [...thresholdAlertsByMonth].sort(([left], [right]) => left.localeCompare(right))) {
      const [provider, month] = key.split(":");
      for (const threshold of [...monthThresholds].sort((a, b) => a - b)) {
        const sent = await sendClaimedTranslationUsageAlert(
          () => claimTranslationThresholdAlert(threshold, month, provider),
          async () => {
            const providerLabel = provider === AZURE_TRANSLATION_PROVIDER ? "Azure Translator F0" : "Google Cloud Translation";
            const response = await fetch(withDiscordWaitParameter(thresholdWebhook), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ content: `ℹ️ ${providerLabel} 누적 사용량 알림\n기준 월: ${month} · 누적 번역량 ${threshold.toLocaleString()}자 이상\n대상: StockTitan RSS`, allowed_mentions: { parse: [] } }), signal: AbortSignal.timeout(8_000) }).catch(() => null);
            return Boolean(response?.ok);
          },
          () => releaseTranslationThresholdAlert(threshold, month, provider),
        );
        if (sent) thresholdAlertSent++;
      }
    }
  }
  return { attempted: fairRows.length, translated, notRequired, fallback, failed, fallbackReasons: countMarketRssTranslationFallbackReasons(fallbackReasonCodes), translationUsage: tracked.getMetrics(), limitReached, limitAlertSent, thresholdAlerts: [...thresholdAlerts].sort((a, b) => a - b), thresholdAlertSent };
}

export async function notifyPendingMarketRssArticles(limit = 10) {
  const webhook = await loadFeatureDiscordWebhook("market-rss", ["MARKET_RSS_DISCORD_WEBHOOK_URL"]);
  if (!webhook) return { attempted: 0, sent: 0, skipped: true, reason: "webhook_not_configured" };
  const db = getDb();
  const now = Date.now();
  const staleLeaseCutoff = new Date(now - 10 * 60_000);
  await db.update(marketRssArticles).set({ notificationStatus: "PENDING", lastError: "stale_processing_recovered", updatedAt: new Date() }).where(and(eq(marketRssArticles.notificationStatus, "PROCESSING"), lt(marketRssArticles.updatedAt, staleLeaseCutoff)));
  await db.update(marketRssArticles).set({ notificationStatus: "UNCERTAIN", lastError: "stale_sending_outcome_unknown", updatedAt: new Date() }).where(and(eq(marketRssArticles.notificationStatus, "SENDING"), lt(marketRssArticles.updatedAt, staleLeaseCutoff)));
  await db.update(marketRssArticles).set({ notificationStatus: "PENDING", lastError: null, updatedAt: new Date() }).where(and(
    inArray(marketRssArticles.source, [...MARKET_RSS_DISCORD_ALLOWED_SOURCES]),
    eq(marketRssArticles.notificationStatus, "SKIPPED"),
    inArray(marketRssArticles.lastError, ["source_not_allowed_for_discord", "backlog_or_stale_article"]),
  ));
  const candidates = and(
    inArray(marketRssArticles.source, [...MARKET_RSS_DISCORD_ALLOWED_SOURCES]),
    eq(marketRssArticles.notificationStatus, "PENDING"),
    buildMarketRssNotificationTranslationGate(),
  );
  const sourceQueues = await Promise.all(MARKET_RSS_DISCORD_ALLOWED_SOURCES.map((source) => db.select().from(marketRssArticles).where(and(candidates, eq(marketRssArticles.source, source))).orderBy(asc(marketRssArticles.createdAt), desc(marketRssArticles.priority)).limit(limit)));
  const rows = interleaveMarketRssSourceQueues(sourceQueues, limit);
  let sent = 0;
  let queueEnqueueFailed = 0;
  for (const row of rows) {
    const reaction = row.detectedTicker ? await resolveSingleMarketNewsReaction(row.detectedTicker) : null;
    const notificationPayload = buildMarketRssDiscordNotificationPayload(row, reaction);
    const delivery = await deliverMarketRssDiscordNotification({ notificationAttempts: row.notificationAttempts, payload: notificationPayload }, {
      claimProcessing: async () => {
        const claimed = await db.update(marketRssArticles).set({ notificationStatus: "PROCESSING", lastError: null, updatedAt: new Date() }).where(buildMarketRssNotificationClaimCondition(row)).returning({ id: marketRssArticles.id });
        return claimed.length === 1;
      },
      markSending: async () => {
        const sendingAt = new Date();
        const updated = await db.update(marketRssArticles).set({ notificationStatus: "SENDING", notificationAttempts: row.notificationAttempts + 1, notifiedAt: sendingAt, updatedAt: sendingAt }).where(and(eq(marketRssArticles.id, row.id), eq(marketRssArticles.notificationStatus, "PROCESSING"))).returning({ id: marketRssArticles.id });
        return updated.length === 1;
      },
      send: async (payload) => {
        for (let attempt = 0; attempt < 4; attempt++) {
          const response = await fetch(withDiscordWaitParameter(webhook), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(toTextWebhookPayload(payload)), signal: AbortSignal.timeout(8_000) });
          if (response.ok) return;
          const error = await createDiscordHttpError(response);
          if (response.status !== 429 || attempt === 3 || error.retryAfterSeconds === undefined) throw error;
          await new Promise((resolve) => setTimeout(resolve, Math.ceil(error.retryAfterSeconds! * 1_000)));
        }
      },
      markFailed: async (attempt, error) => {
        const message = error instanceof Error ? error.message : String(error);
        await db.update(marketRssArticles).set({ notificationStatus: "FAILED", notificationAttempts: attempt, lastError: message, updatedAt: new Date() }).where(eq(marketRssArticles.id, row.id));
      },
      isRetryable: isRetryableDiscordError,
      enqueue: async (payload, attempt) => {
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
    if (delivery.sent) sent++;
    if (delivery.queueEnqueueFailed) queueEnqueueFailed++;
  }
  return { attempted: rows.length, sent, queueEnqueueFailed, skipped: false, batchLimit: limit, webhookConfigured: true };
}
