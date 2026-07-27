import { NextResponse } from "next/server";
import { withAutomationRun } from "@/lib/automation-run";
import { loadFeatureModuleSettings } from "@/lib/feature-module-settings";
import { isWithinSchedule } from "@/lib/schedule-time";
import { detectNewsCandidates } from "@/lib/kis-news-radar";
import { sendPushAlerts } from "@/lib/push";
import type { AlertItem } from "@/lib/types";
import { getDb } from "@/lib/db";
import { alertEvents } from "@/lib/schema";

export const dynamic = "force-dynamic";
const sentEvents = new Set<string>();
const MIN_NEWS_ALERT_RATE = 5;

async function handle(request: Request) {
  const secret = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || request.headers.get("x-cron-secret") || new URL(request.url).searchParams.get("secret") || "";
  if (!secret || secret !== process.env.CRON_SECRET) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let settings;
  try { settings = await loadFeatureModuleSettings("us-news-radar"); }
  catch { settings = { enabled: true, startTime: "17:00", endTime: "02:00", cooldownSeconds: 60, activeDays: [1, 2, 3, 4, 5] }; }
  if (!settings.enabled) return NextResponse.json({ ok: true, skipped: true, reason: "disabled" });
  if (!isWithinSchedule(settings)) return NextResponse.json({ ok: true, skipped: true, reason: "outside_schedule" });
  try {
    const result = await withAutomationRun("us-news-radar", () => detectNewsCandidates());
    const alerts: AlertItem[] = [];
    for (const item of result.candidates.filter((item) => item.valid && item.marketReaction.rate !== null && item.marketReaction.rate >= MIN_NEWS_ALERT_RATE)) {
      const externalId = `news-radar:${item.event.id}:${item.symbol.ticker}`;
      if (sentEvents.has(externalId)) continue;
      sentEvents.add(externalId);
      // Persistent claim prevents duplicate notifications after OCI restarts.
      const db = getDb();
      if (db) {
        const claimed = await db.insert(alertEvents).values({ source: "NEWS_RADAR", externalId }).onConflictDoNothing({ target: [alertEvents.source, alertEvents.externalId] }).returning({ id: alertEvents.id });
        if (claimed.length === 0) continue;
      }
      alerts.push({ source: "NEWS_RADAR", externalId, level: "뉴스 검증 완료", company: item.symbol.name || item.symbol.ticker, title: item.event.title, link: `/scanners/us?symbol=${encodeURIComponent(item.symbol.ticker)}`, publishedAt: `${item.event.date.slice(0, 4)}-${item.event.date.slice(4, 6)}-${item.event.date.slice(6, 8)}T${item.event.time.slice(0, 2)}:${item.event.time.slice(2, 4)}:${item.event.time.slice(4, 6)}+09:00` });
    }
    if (alerts.length) await sendPushAlerts(alerts);
    return NextResponse.json({ ok: true, radarCount: result.radar.length, candidateCount: result.candidates.length, verifiedCount: result.candidates.filter((item) => item.valid).length, alertEligibleCount: result.candidates.filter((item) => item.valid && item.marketReaction.rate !== null && item.marketReaction.rate >= MIN_NEWS_ALERT_RATE).length, sent: alerts.length, candidates: result.candidates });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 502 });
  }
}

export const GET = handle;
export const POST = handle;
