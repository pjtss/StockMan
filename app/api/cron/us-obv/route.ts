import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { alertEvents } from "@/lib/schema";
import { runUsObvScan } from "@/lib/us-obv";

function seoulNow() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")), minute: Number(get("minute")) };
}

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const supplied = request.headers.get("x-cron-secret") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!secret || supplied !== secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const now = seoulNow();
  if (now.hour !== 8 || now.minute !== 55) return NextResponse.json({ ok: true, skipped: true, reason: "outside_schedule" });
  const db = getDb();
  if (!db) return NextResponse.json({ ok: false, error: "Database connection is not available." }, { status: 503 });
  const externalId = `us-obv:${now.date}`;
  const claimed = await db.insert(alertEvents).values({ source: "US_OBV", externalId }).onConflictDoNothing().returning({ id: alertEvents.id });
  if (claimed.length === 0) return NextResponse.json({ ok: true, skipped: true, reason: "already_sent", date: now.date });
  try { return NextResponse.json({ ok: true, date: now.date, ...(await runUsObvScan()) }); }
  catch (error) { await db.delete(alertEvents).where(eq(alertEvents.externalId, externalId)); return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 502 }); }
}
