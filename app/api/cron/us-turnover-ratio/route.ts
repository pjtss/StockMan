import { NextResponse } from "next/server";
import { ensureSchema } from "@/lib/db";
import { runUsTurnoverRatioAutomation } from "@/lib/us-turnover-ratio-automation";
import { withAutomationLock } from "@/lib/automation-lock";

export const dynamic = "force-dynamic";

async function handleUsTurnoverRatio(request: Request) {
  const secret = request.headers.get("x-cron-secret") || new URL(request.url).searchParams.get("secret") || "";
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await ensureSchema();
    const data = await withAutomationLock("us-turnover-ratio", runUsTurnoverRatioAutomation);
    return NextResponse.json({ ok: true, data: data ?? { skipped: true, reason: "already_running", sent: 0 } });
  } catch (error) {
    console.error("[OCI Cron] US turnover ratio failed:", error);
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}

export const GET = handleUsTurnoverRatio;
export const POST = handleUsTurnoverRatio;
