import { NextResponse } from "next/server";
import { retryDiscordDeliveries } from "@/lib/discord-delivery-retry";
import { withAutomationRun } from "@/lib/automation-run";
import { loadFeatureModuleSettings } from "@/lib/feature-module-settings";
import { isWithinSchedule } from "@/lib/schedule-time";
import { recordSkippedAutomationRun } from "@/lib/automation-run-repository";

async function handle(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const supplied = request.headers.get("x-cron-secret") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!secret || supplied !== secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const settings = await loadFeatureModuleSettings("discord-delivery-retry");
    if (!settings.enabled) { await recordSkippedAutomationRun("discord-delivery-retry", "disabled"); return NextResponse.json({ ok: true, skipped: true, reason: "disabled" }); }
    if (!isWithinSchedule(settings, new Date())) { await recordSkippedAutomationRun("discord-delivery-retry", "outside_schedule"); return NextResponse.json({ ok: true, skipped: true, reason: "outside_schedule" }); }
    return NextResponse.json({ ok: true, ...(await withAutomationRun("discord-delivery-retry", retryDiscordDeliveries)) });
  } catch (error) {
    console.error("[API /cron/discord-delivery-retry] Error:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ ok: false, error: "DISCORD_DELIVERY_RETRY_FAILED" }, { status: 502 });
  }
}
export const GET = handle;
export const POST = handle;
