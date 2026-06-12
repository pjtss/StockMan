import { NextResponse } from "next/server";
import { syncTradingIntensityStocks, fetchTradingIntensity } from "@/lib/kis";
import { sendPushAlerts } from "@/lib/push";
import { clearTokenCache } from "@/lib/kis";
import type { AlertItem } from "@/lib/types";
import { isDomesticScannerOpen } from "@/lib/scanner-hours";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    if (!(await isDomesticScannerOpen())) {
      return NextResponse.json(
        { success: false, error: "국내 스캐너는 KST 08:00~15:30에만 동작합니다." },
        { status: 503 },
      );
    }

    const KIS_APPKEY = process.env.KIS_APPKEY;
    const KIS_APPSECRET = process.env.KIS_APPSECRET;

    // 실시간 fetch 디버그 진단 및 동기화 수행
    const rawTop10 = await fetchTradingIntensity();
    const newlyAdded = await syncTradingIntensityStocks();
    let sentCount = 0;

    // 100% 미만인 종목은 알림 대상에서 제외 (DB에는 저장되지만 푸시 알림은 발송하지 않음)
    const newlyAddedForAlerts = newlyAdded.filter((s) => s.intensity >= 100);

    if (newlyAddedForAlerts.length > 0) {
      const intensityAlerts: AlertItem[] = newlyAddedForAlerts.map((s) => ({
        source: "INTENSITY",
        externalId: `intensity-${s.code}-${Date.now()}`,
        level: "체결강도 TOP 10",
        company: s.company,
        title: `${s.intensity}%`,
        link: "/scanners/trading-intensity",
        publishedAt: new Date().toISOString(),
      }));

      await sendPushAlerts(intensityAlerts);
      sentCount = intensityAlerts.length;
    }

    return NextResponse.json({
      success: true,
      debug: {
        hasAppKey: !!KIS_APPKEY,
        hasAppSecret: !!KIS_APPSECRET,
        rawTop10Length: rawTop10.length,
        isFallback: (rawTop10 as any).isFallback ?? false,
        fallbackSource: (rawTop10 as any).fallbackSource ?? "kis",
        kisError: (rawTop10 as any).kisError ?? null,
        rawTop10,
        nodeEnv: process.env.NODE_ENV,
      },
      newlyAdded,
      newlyAddedForAlerts: newlyAddedForAlerts.map((s) => ({ code: s.code, intensity: s.intensity })),
      sentCount,
    });
  } catch (error) {
    console.error("Manual sync trading-intensity stocks failed:", error);
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
