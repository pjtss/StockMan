import { and, asc, eq, lte } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { discordDeliveryQueue } from "@/lib/schema";

export async function enqueueDiscordDelivery(source: string, webhookUrl: string, payload: unknown) {
  const db = getDb();
  return db.insert(discordDeliveryQueue).values({ source, webhookUrl, payload }).returning({ id: discordDeliveryQueue.id });
}

export async function processDiscordDeliveryQueue(limit = 20) {
  const db = getDb();
  const rows = await db.select().from(discordDeliveryQueue)
    .where(and(eq(discordDeliveryQueue.status, "pending"), lte(discordDeliveryQueue.nextAttemptAt, new Date())))
    .orderBy(asc(discordDeliveryQueue.createdAt)).limit(limit);
  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      const response = await fetch(`${row.webhookUrl}${row.webhookUrl.includes("?") ? "&" : "?"}wait=true`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(row.payload),
      });
      if (!response.ok) throw new Error(`Discord HTTP ${response.status}`);
      await db.update(discordDeliveryQueue).set({ status: "sent", sentAt: new Date(), lastError: null }).where(eq(discordDeliveryQueue.id, row.id));
      sent += 1;
    } catch (error) {
      const attempts = row.attempts + 1;
      const terminal = attempts >= 5;
      await db.update(discordDeliveryQueue).set({
        status: terminal ? "failed" : "pending",
        attempts,
        nextAttemptAt: new Date(Date.now() + Math.min(15, 2 ** attempts) * 60_000),
        lastError: error instanceof Error ? error.message : String(error),
      }).where(eq(discordDeliveryQueue.id, row.id));
      failed += 1;
    }
  }
  return { processed: rows.length, sent, failed };
}
