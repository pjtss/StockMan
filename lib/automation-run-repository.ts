import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { automationRuns } from "@/lib/schema";
import type { FeatureModuleKey } from "@/lib/feature-modules";

export async function startAutomationRun(moduleKey: FeatureModuleKey) {
  const db = getDb();
  const rows = await db.insert(automationRuns).values({ moduleKey, status: "RUNNING", startedAt: new Date() }).returning({ id: automationRuns.id });
  return rows[0]?.id;
}

export async function finishAutomationRun(id: number | undefined, status: "SUCCESS" | "PARTIAL" | "FAILED", summary: Record<string, unknown> = {}, errorMessage?: string) {
  if (!id) return;
  const db = getDb();
  await db.update(automationRuns).set({ status, finishedAt: new Date(), summary, errorMessage: errorMessage || null }).where(eq(automationRuns.id, id));
}

export async function loadRecentAutomationRuns(moduleKey: FeatureModuleKey, limit = 20) {
  const db = getDb();
  return db.select().from(automationRuns).where(eq(automationRuns.moduleKey, moduleKey)).orderBy(desc(automationRuns.startedAt)).limit(limit);
}

export async function loadLatestAutomationRun(moduleKey: FeatureModuleKey) {
  const rows = await loadRecentAutomationRuns(moduleKey, 1);
  return rows[0] || null;
}
