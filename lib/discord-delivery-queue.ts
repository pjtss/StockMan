import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { discordDeliveryQueue } from "@/lib/schema";
import { marketRssArticles } from "@/lib/schema";
import { sql } from "drizzle-orm";

export async function enqueueDiscordDelivery(input: { externalId: string; channelKey: string; payload: Record<string, unknown> }) {
  const db = getDb();
  const rows = await db.insert(discordDeliveryQueue).values({ externalId: input.externalId, channelKey: input.channelKey, payload: input.payload }).onConflictDoNothing().returning({ id: discordDeliveryQueue.id });
  return rows[0]?.id ?? null;
}

export async function claimDueDiscordDeliveries(limit = 50) {
  const db = getDb();
  const safeLimit = Math.max(1, Math.min(200, Math.trunc(limit)));
  // Claim in the database, atomically.  The previous select-then-update flow
  // allowed two overlapping cron invocations to deliver the same webhook.
  // PROCESSING means no external request has started and is safe to retry.
  const recoveredBeforeSend = await db.execute(sql`
    UPDATE discord_delivery_queue
    SET status = 'PENDING',
        last_error = COALESCE(last_error, 'stale_processing_recovered'),
        next_attempt_at = NOW(),
        updated_at = NOW()
    WHERE status = 'PROCESSING'
      AND updated_at < NOW() - INTERVAL '10 minutes'
    RETURNING id
  `);
  // SENDING means Discord may have accepted the request. Quarantine it for
  // operator reconciliation instead of automatically creating a duplicate.
  const quarantinedDuringSend = await db.execute(sql`
    UPDATE discord_delivery_queue
    SET status = 'UNCERTAIN',
        last_error = COALESCE(last_error, 'stale_sending_outcome_unknown'),
        updated_at = NOW()
    WHERE status = 'SENDING'
      AND updated_at < NOW() - INTERVAL '10 minutes'
    RETURNING id
  `);
  const result = await db.execute(sql`
    WITH due AS (
      SELECT id
      FROM discord_delivery_queue
      WHERE status = 'PENDING'
        AND next_attempt_at <= NOW()
      ORDER BY next_attempt_at, id
      LIMIT ${safeLimit}
      FOR UPDATE SKIP LOCKED
    ), claimed AS (
      UPDATE discord_delivery_queue AS queue
      -- JavaScript Date and node-postgres retain millisecond precision. Store
      -- the lease timestamp at the same precision so the worker can compare it
      -- exactly before crossing the external-send boundary.
      SET status = 'PROCESSING', updated_at = date_trunc('milliseconds', NOW())
      FROM due
      WHERE queue.id = due.id
      RETURNING queue.id,
        queue.external_id AS "externalId",
        queue.channel_key AS "channelKey",
        queue.payload,
        queue.status,
        queue.attempts,
        queue.next_attempt_at AS "nextAttemptAt",
        queue.last_error AS "lastError",
        queue.sent_at AS "sentAt",
        queue.created_at AS "createdAt",
        queue.updated_at AS "updatedAt"
    )
    SELECT * FROM claimed ORDER BY "nextAttemptAt", id
  `);
  return {
    deliveries: result.rows as unknown as Array<typeof discordDeliveryQueue.$inferSelect>,
    staleRecovered: recoveredBeforeSend.rows.length,
    uncertain: quarantinedDuringSend.rows.length,
  };
}

export async function markDiscordDeliverySending(id: number, claimedAt: Date) {
  const db = getDb();
  const sendingAt = new Date();
  const rows = await db.update(discordDeliveryQueue)
    .set({ status: "SENDING", updatedAt: sendingAt })
    .where(and(eq(discordDeliveryQueue.id, id), eq(discordDeliveryQueue.status, "PROCESSING"), eq(discordDeliveryQueue.updatedAt, claimedAt)))
    .returning({ id: discordDeliveryQueue.id });
  if (rows.length !== 1) throw new Error("discord_delivery_claim_lost_before_send");
  return sendingAt;
}

export async function getMarketRssDeliveryArticleSnapshot(articleId: number) {
  const db = getDb();
  const rows = await db.select({
    source: marketRssArticles.source,
    title: marketRssArticles.title,
    summary: marketRssArticles.summary,
    translatedTitle: marketRssArticles.translatedTitle,
    translationStatus: marketRssArticles.translationStatus,
    translationFallback: marketRssArticles.translationFallback,
    translationSkippedReason: marketRssArticles.translationSkippedReason,
    translationError: marketRssArticles.translationError,
    detectedTicker: marketRssArticles.detectedTicker,
    link: marketRssArticles.link,
    publishedAt: marketRssArticles.publishedAt,
  }).from(marketRssArticles).where(eq(marketRssArticles.id, articleId)).limit(1);
  return rows[0] ?? null;
}

/** Retire a queued RSS payload whose article changed before its next send attempt. */
export async function markDiscordDeliverySuperseded(input: { id: number; articleId: number; claimedAt: Date }) {
  const db = getDb();
  const now = new Date();
  await db.transaction(async (tx) => {
    const updated = await tx.update(discordDeliveryQueue)
      .set({ status: "FAILED", lastError: "market_rss_payload_superseded", updatedAt: now })
      .where(and(eq(discordDeliveryQueue.id, input.id), eq(discordDeliveryQueue.status, "PROCESSING"), eq(discordDeliveryQueue.updatedAt, input.claimedAt)))
      .returning({ id: discordDeliveryQueue.id });
    if (updated.length !== 1) throw new Error("discord_delivery_claim_lost_before_supersede");
    await tx.update(marketRssArticles)
      .set({ notificationStatus: "PENDING", lastError: null, updatedAt: now })
      .where(and(eq(marketRssArticles.id, input.articleId), eq(marketRssArticles.notificationStatus, "FAILED")));
  });
}

export async function persistDiscordDeliveryOutcome(input: {
  id: number;
  articleId: number | null;
  status: "SENT" | "PENDING" | "FAILED";
  attempts: number;
  claimedAt: Date;
  expectedStatus: "PROCESSING" | "SENDING";
  error?: string;
}) {
  const db = getDb();
  const now = new Date();
  const queueUpdate: Record<string, unknown> = {
    status: input.status,
    attempts: input.attempts,
    lastError: input.status === "SENT" ? null : input.error || "Discord delivery failed",
    updatedAt: now,
    ...(input.status === "SENT" ? { sentAt: now } : {}),
    ...(input.status === "PENDING" ? {
      nextAttemptAt: new Date(now.getTime() + Math.min(3600, 2 ** Math.min(input.attempts, 10)) * 1000),
    } : {}),
  };
  await db.transaction(async (tx) => {
    const updated = await tx.update(discordDeliveryQueue)
      .set(queueUpdate)
      .where(and(eq(discordDeliveryQueue.id, input.id), eq(discordDeliveryQueue.status, input.expectedStatus), eq(discordDeliveryQueue.updatedAt, input.claimedAt)))
      .returning({ id: discordDeliveryQueue.id });
    if (updated.length !== 1) throw new Error("discord_delivery_claim_lost_before_outcome_persist");
    if (input.articleId == null) return;
    await tx.update(marketRssArticles).set({
      notificationStatus: input.status === "SENT" ? "SENT" : "FAILED",
      notificationAttempts: sql`${marketRssArticles.notificationAttempts} + 1`,
      ...(input.status === "SENT" ? { notifiedAt: now, lastError: null } : { lastError: input.error || "Discord delivery failed" }),
      updatedAt: now,
    }).where(eq(marketRssArticles.id, input.articleId));
  });
}
