import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { discordDeliveryQueue } from "@/lib/schema";
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
  // Recover abandoned PROCESSING rows first so a crashed worker cannot strand
  // a delivery forever.
  await db.execute(sql`
    UPDATE discord_delivery_queue
    SET status = 'PENDING',
        last_error = COALESCE(last_error, 'stale_processing_recovered'),
        next_attempt_at = NOW(),
        updated_at = NOW()
    WHERE status = 'PROCESSING'
      AND updated_at < NOW() - INTERVAL '10 minutes'
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
      SET status = 'PROCESSING', updated_at = NOW()
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
  return result.rows as unknown as Array<typeof discordDeliveryQueue.$inferSelect>;
}

export async function markDiscordDeliveryRetry(id: number, error: string, attempts: number) {
  const db = getDb();
  const delaySeconds = Math.min(3600, 2 ** Math.min(attempts, 10));
  await db.update(discordDeliveryQueue).set({ status: "PENDING", attempts, lastError: error, nextAttemptAt: new Date(Date.now() + delaySeconds * 1000), updatedAt: new Date() }).where(eq(discordDeliveryQueue.id, id));
}

export async function markDiscordDeliveryProcessing(id: number) {
  const db = getDb();
  await db.update(discordDeliveryQueue).set({ status: "PROCESSING", updatedAt: new Date() }).where(and(eq(discordDeliveryQueue.id, id), eq(discordDeliveryQueue.status, "PENDING")));
}

export async function markDiscordDeliverySent(id: number) {
  const db = getDb();
  await db.update(discordDeliveryQueue).set({ status: "SENT", sentAt: new Date(), updatedAt: new Date() }).where(eq(discordDeliveryQueue.id, id));
}
