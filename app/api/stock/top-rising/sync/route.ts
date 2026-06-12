import { NextResponse } from "next/server";
import { syncTopRisingStocks, fetchTopRisingStocks } from "@/lib/kis-us";
import { sendPushAlerts } from "@/lib/push";
import { runWithKisUsDebugCapture } from "@/lib/kis-us-debug";
import type { AlertItem } from "@/lib/types";
import { isUsTopRisingOpen } from "@/lib/scanner-hours";
import { loadAdminFeatureFlags } from "@/lib/admin-flags";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const flags = await loadAdminFeatureFlags();
    if (!flags.us_scanners) {
      return NextResponse.json(
        { success: false, error: "미국 스캐너 기능이 관리자에 의해 비활성화되었습니다." },
        { status: 503 },
      );
    }
    if (!(await isUsTopRisingOpen())) {
      return NextResponse.json(
        { success: false, error: "미국 상승률 TOP N은 설정된 시간에만 동작합니다." },
        { status: 503 },
      );
    }

    const KIS_APPKEY = process.env.KIS_APPKEY;
    const KIS_APPSECRET = process.env.KIS_APPSECRET;

    // 실시간 fetch를 직접 진단하기 위한 debug
    const captured = await runWithKisUsDebugCapture(async () => {
      const rawTop10 = await fetchTopRisingStocks();
      const newlyAdded = await syncTopRisingStocks();
      return { rawTop10, newlyAdded };
    });
    const rawTop10 = captured.result.rawTop10;
    const newlyAdded = captured.result.newlyAdded;
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
        isFallback: (rawTop10 as any).isFallback ?? false,
        fallbackSource: (rawTop10 as any).fallbackSource ?? "kis",
        kisError: (rawTop10 as any).kisError ?? null,
        rawTop10,
        kisUsLogs: captured.logs,
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
