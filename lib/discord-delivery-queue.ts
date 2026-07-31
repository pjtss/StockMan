import { and, asc, eq, lte } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { discordDeliveryQueue } from "@/lib/schema";

export async function enqueueDiscordDelivery(input: { externalId: string; channelKey: string; payload: Record<string, unknown> }) {
  const db = getDb();
  const rows = await db.insert(discordDeliveryQueue).values({ externalId: input.externalId, channelKey: input.channelKey, payload: input.payload }).onConflictDoNothing().returning({ id: discordDeliveryQueue.id });
  return rows[0]?.id ?? null;
}

export async function claimDueDiscordDeliveries(limit = 50) {
  const db = getDb();
  return db.select().from(discordDeliveryQueue).where(and(eq(discordDeliveryQueue.status, "PENDING"), lte(discordDeliveryQueue.nextAttemptAt, new Date()))).orderBy(asc(discordDeliveryQueue.nextAttemptAt)).limit(limit);
}

export async function markDiscordDeliveryRetry(id: number, error: string, attempts: number) {
  const db = getDb();
  const delaySeconds = Math.min(3600, 2 ** Math.min(attempts, 10));
  await db.update(discordDeliveryQueue).set({ status: "PENDING", attempts, lastError: error, nextAttemptAt: new Date(Date.now() + delaySeconds * 1000), updatedAt: new Date() }).where(eq(discordDeliveryQueue.id, id));
}

export async function markDiscordDeliverySent(id: number) {
  const db = getDb();
  await db.update(discordDeliveryQueue).set({ status: "SENT", sentAt: new Date(), updatedAt: new Date() }).where(eq(discordDeliveryQueue.id, id));
}
