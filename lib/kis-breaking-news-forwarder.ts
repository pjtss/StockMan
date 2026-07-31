import { and, eq } from "drizzle-orm";
import { getDb } from "./db";
import { usBreakingNewsDiscordDeliveries } from "./schema";
import { fetchBreakingNews, type KisBreakingNews } from "./kis-news-radar";
import { buildBreakingNewsPayload, isBreakingNewsDiscordConfigured, sendBreakingNewsToDiscord } from "./discord-breaking-news";
import { enqueueDiscordDelivery } from "./discord-delivery-queue";

function publishedAt(event: KisBreakingNews) { return new Date(`${event.date.slice(0, 4)}-${event.date.slice(4, 6)}-${event.date.slice(6, 8)}T${event.time.slice(0, 2)}:${event.time.slice(2, 4)}:${event.time.slice(4, 6)}+09:00`); }

export async function forwardBreakingNews(options: { send: boolean; date?: string; time?: string }) {
  const events = await fetchBreakingNews({ date: options.date, time: options.time });
  const db = getDb();
  const result: Array<{ externalId: string; title: string; status: string; error?: string }> = [];
  for (const event of events) {
    const externalId = `breaking-news:${event.id}`;
    if (db) {
      const existing = await db.select({ status: usBreakingNewsDiscordDeliveries.status }).from(usBreakingNewsDiscordDeliveries).where(eq(usBreakingNewsDiscordDeliveries.externalId, externalId)).limit(1);
      if (existing[0]?.status === "SENT") { result.push({ externalId, title: event.title, status: "ALREADY_SENT" }); continue; }
    }
    if (!options.send) { result.push({ externalId, title: event.title, status: "PREVIEW" }); continue; }
    try {
      const sent = await sendBreakingNewsToDiscord(event);
      if (!sent.ok) throw new Error(`Discord HTTP ${sent.status}: ${sent.responseText.slice(0, 200)}`);
      if (db) await db.insert(usBreakingNewsDiscordDeliveries).values({ externalId, title: event.title, source: event.source, publishedAt: publishedAt(event), status: "SENT", attempts: 1, sentAt: new Date(), updatedAt: new Date() }).onConflictDoUpdate({ target: usBreakingNewsDiscordDeliveries.externalId, set: { status: "SENT", attempts: 1, sentAt: new Date(), updatedAt: new Date(), lastError: null } });
      result.push({ externalId, title: event.title, status: "SENT" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await enqueueDiscordDelivery({ externalId: `retry:BREAKING_NEWS:${externalId}:${Date.now()}`, channelKey: "BREAKING_NEWS", payload: buildBreakingNewsPayload(event) });
      if (db) await db.insert(usBreakingNewsDiscordDeliveries).values({ externalId, title: event.title, source: event.source, publishedAt: publishedAt(event), status: "FAILED", attempts: 1, lastError: message, updatedAt: new Date() }).onConflictDoUpdate({ target: usBreakingNewsDiscordDeliveries.externalId, set: { status: "FAILED", attempts: 1, lastError: message, updatedAt: new Date() } });
      result.push({ externalId, title: event.title, status: "FAILED", error: message });
    }
  }
  return { configured: isBreakingNewsDiscordConfigured(), fetchedCount: events.length, sentCount: result.filter((item) => item.status === "SENT").length, duplicateCount: result.filter((item) => item.status === "ALREADY_SENT").length, results: result };
}
