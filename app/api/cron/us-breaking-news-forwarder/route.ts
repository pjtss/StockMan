import { NextResponse } from "next/server";
import { forwardBreakingNews } from "@/lib/kis-breaking-news-forwarder";
import { loadFeatureModuleSettings } from "@/lib/feature-module-settings";
import { isWithinSchedule } from "@/lib/schedule-time";
export const dynamic = "force-dynamic";
async function handle(request: Request) {
  const secret = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || request.headers.get("x-cron-secret") || new URL(request.url).searchParams.get("secret") || "";
  if (!secret || secret !== process.env.CRON_SECRET) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { const settings = await loadFeatureModuleSettings("us-breaking-news-forwarder"); if (!settings.enabled) return NextResponse.json({ ok: true, skipped: true, reason: "disabled" }); if (!isWithinSchedule(settings)) return NextResponse.json({ ok: true, skipped: true, reason: "outside_schedule" }); return NextResponse.json({ ok: true, ...(await forwardBreakingNews({ send: true })) }); }
  catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 502 }); }
}
export const GET = handle;
export const POST = handle;
