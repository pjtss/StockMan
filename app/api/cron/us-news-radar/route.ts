import { NextResponse } from "next/server";
import { withAutomationRun } from "@/lib/automation-run";
import { loadFeatureModuleSettings } from "@/lib/feature-module-settings";
import { isWithinSchedule } from "@/lib/schedule-time";
import { detectNewsCandidates } from "@/lib/kis-news-radar";
import { buildNewsRadarDiscordPayload, isNewsRadarDiscordConfigured, sendNewsRadarAlertToDiscord } from "@/lib/discord-news-radar";
import { enqueueDiscordDelivery } from "@/lib/discord-delivery-queue";
import type { AlertItem } from "@/lib/types";
import { getDb } from "@/lib/db";
import { alertEvents, usNewsRadarEvents } from "@/lib/schema";
import { sql } from "drizzle-orm";
import { ensureUsInstrument } from "@/lib/us-daily-breakout-watchlist";

export const dynamic = "force-dynamic";
const sentEvents = new Set<string>();

async function recordRadarEvent(input: { externalId: string; ticker: string; market: string | null; title: string; status: string; error?: string; sent?: boolean }) {
  try {
    const db = getDb();
    if (!db) return;
    const instrumentId = input.market ? await ensureUsInstrument({ market: input.market, code: input.ticker }) : null;
    await db.insert(usNewsRadarEvents).values({ externalId: input.externalId, ticker: input.ticker, market: input.market, instrumentId, title: input.title, status: input.status, attempts: 1, lastError: input.error ?? null, sentAt: input.sent ? new Date() : null, updatedAt: new Date() })
      .onConflictDoUpdate({ target: usNewsRadarEvents.externalId, set: { market: input.market, status: input.status, attempts: sql`${usNewsRadarEvents.attempts} + 1`, lastError: input.error ?? null, sentAt: input.sent ? new Date() : undefined, updatedAt: new Date() } });
  } catch { /* diagnostics must not stop the radar */ }
}

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
    for (const item of result.candidates.filter((item) => item.valid)) {
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
      await recordRadarEvent({ externalId, ticker: item.symbol.ticker, market: item.market, title: item.event.title, status: "VERIFIED" });
    }
    if (alerts.length && !isNewsRadarDiscordConfigured()) throw new Error("NEWS_RADAR_DISCORD_WEBHOOK_URL is not configured");
    for (const alert of alerts) {
      const candidate = result.candidates.find((item) => `news-radar:${item.event.id}:${item.symbol.ticker}` === alert.externalId);
      if (!candidate) continue;
      const sent = await sendNewsRadarAlertToDiscord(alert, candidate.marketReaction);
      if (!sent.ok) {
        await enqueueDiscordDelivery({ externalId: `retry:NEWS_RADAR:${alert.externalId}:${Date.now()}`, channelKey: "NEWS_RADAR", payload: buildNewsRadarDiscordPayload(alert, candidate.marketReaction) });
        await recordRadarEvent({ externalId: alert.externalId, ticker: candidate.symbol.ticker, market: candidate.market, title: candidate.event.title, status: "DISCORD_FAILED", error: `HTTP ${sent.status}` });
        throw new Error(`News radar Discord webhook failed with HTTP ${sent.status}`);
      }
      await recordRadarEvent({ externalId: alert.externalId, ticker: candidate.symbol.ticker, market: candidate.market, title: candidate.event.title, status: "DISCORD_SENT", sent: true });
    }
    return NextResponse.json({ ok: true, radarCount: result.radar.length, candidateCount: result.candidates.length, verifiedCount: result.candidates.filter((item) => item.valid).length, alertEligibleCount: result.candidates.filter((item) => item.valid).length, sent: alerts.length, candidates: result.candidates });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 502 });
  }
}

export const GET = handle;
export const POST = handle;
