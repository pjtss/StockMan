import { NextResponse } from "next/server";
import { syncTopRisingStocks } from "@/lib/kis";
import { sendPushAlerts } from "@/lib/push";
import type { AlertItem } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const newlyAdded = await syncTopRisingStocks();
    let sentCount = 0;

    if (newlyAdded && newlyAdded.length > 0) {
      const risingAlerts: AlertItem[] = newlyAdded.map((s) => ({
        source: "TOP_RISING",
        externalId: `top-rising-${s.code}-${Date.now()}`,
        level: "상승률 TOP 10",
        company: s.company,
        title: s.changeRate,
        link: "/scanners/top-rising",
        publishedAt: new Date().toISOString(),
      }));

      await sendPushAlerts(risingAlerts);
      sentCount = risingAlerts.length;
    }

    return NextResponse.json({
      success: true,
      newlyAdded,
      sentCount,
    });
  } catch (error) {
    console.error("Manual sync top-rising stocks failed:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST() {
  return GET();
}
