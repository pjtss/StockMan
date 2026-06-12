import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { DEFAULT_SCANNER_SCHEDULES, loadScannerSchedules, saveScannerSchedule, type ScannerScheduleKey } from "@/lib/scanner-schedules";
import { getDb } from "@/lib/db";
import { scannerScheduleHistory } from "@/lib/schema";
import { desc } from "drizzle-orm";

const keys: ScannerScheduleKey[] = ["dart", "us_trading_intensity", "domestic_trading_intensity", "us_top_rising"];

export async function GET() {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const schedules = await loadScannerSchedules();
  const db = getDb();
  const history = db ? await db.select().from(scannerScheduleHistory).orderBy(desc(scannerScheduleHistory.updatedAt)).limit(20) : [];
  return NextResponse.json({ schedules, defaults: DEFAULT_SCANNER_SCHEDULES, history });
}

export async function PATCH(request: Request) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const key = String(body.key ?? "") as ScannerScheduleKey;
  const startTime = String(body.startTime ?? "");
  const endTime = String(body.endTime ?? "");

  if (!keys.includes(key)) return NextResponse.json({ error: "Invalid schedule key" }, { status: 400 });
  if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) {
    return NextResponse.json({ error: "Invalid time format" }, { status: 400 });
  }
  if (body.validateOnly) {
    return NextResponse.json({ success: true });
  }

  await saveScannerSchedule(key, { startTime, endTime });
  return NextResponse.json({ success: true, schedule: { startTime, endTime } });
}
