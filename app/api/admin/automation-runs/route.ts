import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { listRecentAutomationRuns } from "@/lib/automation-run-repository";

export async function GET(request: Request) {
  if (!(await requireAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const key = new URL(request.url).searchParams.get("key") || "us-turnover-watch";
  return NextResponse.json({ runs: await listRecentAutomationRuns(key) });
}
