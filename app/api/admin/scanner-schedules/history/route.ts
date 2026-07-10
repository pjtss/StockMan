import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { getDb } from "@/lib/db";
import { scannerScheduleHistory } from "@/lib/schema";
import { desc } from "drizzle-orm";

export async function GET() {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const history = db ? await db.select().from(scannerScheduleHistory).orderBy(desc(scannerScheduleHistory.updatedAt)).limit(20) : [];
  return NextResponse.json({ history });
}
