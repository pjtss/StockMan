import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { loadUserActivityDashboard } from "@/lib/user-activity-dashboard";

export async function GET(request: Request) {
  if (!(await requireAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const rawHours = Number(url.searchParams.get("hours") || 24);
  const rawLimit = Number(url.searchParams.get("limit") || 100);
  const hours = Number.isFinite(rawHours) ? Math.min(24 * 30, Math.max(1, Math.trunc(rawHours))) : 24;
  const limit = Number.isFinite(rawLimit) ? Math.min(500, Math.max(1, Math.trunc(rawLimit))) : 100;
  const userKey = url.searchParams.get("userKey") || "";
  try { return NextResponse.json(userKey ? await loadUserActivityDashboard(hours, limit, userKey) : await loadUserActivityDashboard(hours, limit)); } catch { return NextResponse.json({ ok: false, error: "USER_ACTIVITY_UNAVAILABLE" }, { status: 503 }); }
}
