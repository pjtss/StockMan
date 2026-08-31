import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { loadUserActivityDashboard } from "@/lib/user-activity-dashboard";

export async function GET(request: Request) {
  if (!(await requireAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const hours = Number(url.searchParams.get("hours") || 24);
  const limit = Number(url.searchParams.get("limit") || 100);
  const userKey = url.searchParams.get("userKey") || "";
  return NextResponse.json(userKey ? await loadUserActivityDashboard(hours, limit, userKey) : await loadUserActivityDashboard(hours, limit));
}
