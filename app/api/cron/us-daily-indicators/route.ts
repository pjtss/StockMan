import { NextResponse } from "next/server";
import { scanStoredUsMfiOversold } from "@/lib/us-mfi-oversold";
import { scanStoredUsDmi } from "@/lib/us-dmi-scan";
import { scanStoredUsMacd } from "@/lib/us-macd-scan";
import { sendUsDailyIndicatorSignals } from "@/lib/discord-us-daily-signal";

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const supplied = request.headers.get("x-cron-secret") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!secret || supplied !== secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const intervalSeconds = Math.max(60, Number.parseInt(process.env.US_DAILY_INDICATORS_INTERVAL_SECONDS || "600", 10) || 600);
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const epochSeconds = Math.floor(Date.now() / 1000);
  if (now.getUTCDay() === 0 || epochSeconds % intervalSeconds >= 60) return NextResponse.json({ ok: true, skipped: true, reason: "outside_interval", intervalSeconds, schedule: "monday-saturday" });
  try {
    const [mfi, dmi, macd] = await Promise.all([scanStoredUsMfiOversold(), scanStoredUsDmi(), scanStoredUsMacd()]);
    const discord = await sendUsDailyIndicatorSignals({ mfi: mfi.qualified, dmi: dmi.qualified, macd: macd.qualified });
    return NextResponse.json({ ok: discord.ok, mfi, dmi, macd, discord });
  } catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 502 }); }
}
