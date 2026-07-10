import { NextResponse } from "next/server";
import { syncDartAlerts } from "@/lib/alerts";
import { syncSecAlerts } from "@/lib/sec-alerts";
import { loadAdminFeatureFlags } from "@/lib/admin-flags";
import { isDartOpen } from "@/lib/scanner-hours";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = new URL(request.url).searchParams.get("secret") || "";
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const flags = await loadAdminFeatureFlags();
  const result: Record<string, unknown> = { success: true };

  if (flags.dart_realtime && (await isDartOpen())) {
    result.dart = await syncDartAlerts();
  } else {
    result.dart = { skipped: true, reason: flags.dart_realtime ? "DART disabled outside schedule" : "DART disabled by admin" };
  }

  if (flags.sec_realtime) {
    result.sec = await syncSecAlerts();
  } else {
    result.sec = { skipped: true, reason: "SEC disabled by admin" };
  }

  return NextResponse.json(result);
}
