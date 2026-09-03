import { NextResponse } from "next/server";
import { getTodaySecBullishFeed, syncSecAlerts } from "@/lib/sec-alerts";
import { isFeatureModuleEnabled } from "@/lib/feature-module-gates";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isFeatureModuleEnabled("sec-realtime"))) {
    return NextResponse.json(
      { error: "SEC 공시 기능은 현재 비활성화 상태입니다.", disabled: true },
      { status: 503 },
    );
  }
  try {
    await syncSecAlerts();
    const payload = await getTodaySecBullishFeed();
    return NextResponse.json(payload);
  } catch (error) {
    console.error("[API /sec] Error:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "SEC 데이터를 불러오지 못했습니다." }, { status: 503 });
  }
}
