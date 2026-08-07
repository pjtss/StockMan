import { NextResponse } from "next/server";
import { runUsObvScan } from "@/lib/us-obv";
import { withAutomationRun } from "@/lib/automation-run";

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const supplied = request.headers.get("x-cron-secret") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!secret || supplied !== secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { return NextResponse.json({ ok: true, ...(await withAutomationRun("us-obv", () => runUsObvScan({ sendDiscord: true }))) }); }
  catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 502 }); }
}
