import { NextResponse } from "next/server";
import { getAutomationIntervalSeconds } from "@/lib/automation-settings";

export async function GET() {
  return NextResponse.json({ intervalSeconds: await getAutomationIntervalSeconds() }, { headers: { "cache-control": "no-store", Deprecation: "true", Link: "</api/admin/feature-modules/us-scanners>; rel=successor-version" } });
}
