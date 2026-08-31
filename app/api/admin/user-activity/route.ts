import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { loadUserActivityDashboard } from "@/lib/user-activity-dashboard";

export async function GET(request: Request) {
  if (!(await requireAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  return NextResponse.json(await loadUserActivityDashboard(Number(url.searchParams.get("hours") || 24), Number(url.searchParams.get("limit") || 100), url.searchParams.get("userKey") || ""));
}
