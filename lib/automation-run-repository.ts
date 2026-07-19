import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { automationRuns } from "@/lib/schema";

export async function startAutomationRun(key: string) {
  const db = getDb();
  const rows = await db.insert(automationRuns).values({ key, status: "running" }).returning({ id: automationRuns.id });
  return rows[0]?.id;
}

export async function finishAutomationRun(id: number | undefined, result: { status: string; matchedCount?: number; sentCount?: number; error?: string | null }) {
  if (!id) return;
  const db = getDb();
  await db.update(automationRuns).set({ status: result.status, finishedAt: new Date(), matchedCount: result.matchedCount ?? 0, sentCount: result.sentCount ?? 0, error: result.error ?? null }).where(eq(automationRuns.id, id));
}

export async function listRecentAutomationRuns(key: string, limit = 30) {
  const db = getDb();
  return db.select().from(automationRuns).where(eq(automationRuns.key, key)).orderBy(desc(automationRuns.startedAt)).limit(limit);
}
