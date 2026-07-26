import { NextResponse } from "next/server";
import { ensureSchema } from "@/lib/db";
import { loadAdminFeatureFlags } from "@/lib/admin-flags";
import { sendPushAlerts } from "@/lib/push";
import { syncTopRisingStocks } from "@/lib/kis-us";
import type { AlertItem } from "@/lib/types";
import { withAutomationRun } from "@/lib/automation-run";
import { loadFeatureModuleSettings } from "@/lib/feature-module-settings";
import { isWithinSchedule } from "@/lib/schedule-time";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const secret = request.headers.get("x-cron-secret") || new URL(request.url).searchParams.get("secret") || "";
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await ensureSchema();
    const flags = await loadAdminFeatureFlags();
    let settings;
    try {
      settings = await loadFeatureModuleSettings("us-scanners");
    } catch (error) {
      console.warn("[OCI Cron] scanner feature settings unavailable; using legacy behavior", error instanceof Error ? error.message : error);
      settings = { enabled: true, startTime: "17:00", endTime: "02:00", cooldownSeconds: 60, activeDays: [1, 2, 3, 4, 5] };
    }
    if (!flags.us_scanners || !settings.enabled) {
      return NextResponse.json({ ok: true, skipped: true, reason: "disabled", sent: 0 });
    }
    if (!isWithinSchedule(settings)) return NextResponse.json({ ok: true, skipped: true, reason: "outside_schedule", sent: 0 });

    return NextResponse.json(await withAutomationRun("us-scanners", async () => {
      const newlyAdded = await syncTopRisingStocks();
      if (!newlyAdded || newlyAdded.length === 0) return { ok: true, sent: 0 };

    const alerts: AlertItem[] = newlyAdded.map((stock) => ({
      source: "TOP_RISING",
      externalId: `top-rising-${stock.code}-${Date.now()}`,
      level: "상승률 TOP 10",
      company: stock.company,
      title: stock.changeRate,
      link: "/scanners/top-rising",
      publishedAt: new Date().toISOString(),
    }));
      await sendPushAlerts(alerts);
      return { ok: true, sent: alerts.length };
    }));
  } catch (error) {
    console.error("[OCI Cron] bullish sync failed:", error);
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
