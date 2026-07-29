import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { requireAdminSession } from "@/lib/admin-auth";
import { getDb } from "@/lib/db";
import { usNewsRadarEvents } from "@/lib/schema";

export async function GET() {
  if (!(await requireAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = getDb();
  if (!db) return NextResponse.json({ ok: false, error: "Database connection is not available." }, { status: 503 });
  const events = await db.select().from(usNewsRadarEvents).orderBy(desc(usNewsRadarEvents.updatedAt)).limit(100);
  return NextResponse.json({ ok: true, count: events.length, events });
}
