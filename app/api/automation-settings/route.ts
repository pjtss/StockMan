import { NextResponse } from "next/server";
import { getAutomationIntervalSeconds } from "@/lib/automation-settings";

export async function GET() {
  try {
    return NextResponse.json({ intervalSeconds: await getAutomationIntervalSeconds() }, { headers: { "cache-control": "no-store", Deprecation: "true", Link: "</api/admin/feature-modules/us-scanners>; rel=successor-version" } });
  } catch {
    return NextResponse.json({ ok: false, error: "AUTOMATION_SETTINGS_UNAVAILABLE" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
