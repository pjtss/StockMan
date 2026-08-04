import { NextResponse } from "next/server";
import { warmUsDailyPriceCache } from "@/lib/us-daily-price-cache-warm";

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const supplied = request.headers.get("x-cron-secret") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!secret || supplied !== secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  if ([0, 6].includes(now.getUTCDay()) || now.getUTCHours() !== 8 || now.getUTCMinutes() !== 0) return NextResponse.json({ ok: true, skipped: true, reason: "outside_schedule", schedule: "weekdays 08:00 KST" });
  try { return NextResponse.json({ ok: true, ...(await warmUsDailyPriceCache()) }); }
  catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 502 }); }
}
