import { NextResponse } from "next/server";
import { syncTopRisingStocks, fetchTopRisingStocks } from "@/lib/kis";
import { sendPushAlerts } from "@/lib/push";
import type { AlertItem } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const KIS_APPKEY = process.env.KIS_APPKEY;
    const KIS_APPSECRET = process.env.KIS_APPSECRET;

    // 실시간 fetch를 직접 진단하기 위한 debug
    const rawTop10 = await fetchTopRisingStocks();
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
      debug: {
        hasAppKey: !!KIS_APPKEY,
        hasAppSecret: !!KIS_APPSECRET,
        rawTop10Length: rawTop10.length,
        nodeEnv: process.env.NODE_ENV,
      },
      newlyAdded,
      sentCount,
    });
  } catch (error) {
    console.error("Manual sync top-rising stocks failed:", error);
    return NextResponse.json({
      success: false,
      error: String(error),
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 200 });
  }
}

export async function POST() {
  return GET();
}
