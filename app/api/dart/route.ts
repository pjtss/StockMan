import { NextResponse } from "next/server";
import { getTodayDartBullishFeed, syncDartAlerts } from "@/lib/alerts";
import { loadAdminFeatureFlags } from "@/lib/admin-flags";
import { isDartOpen } from "@/lib/scanner-hours";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const flags = await loadAdminFeatureFlags();
    if (!flags.dart_realtime) {
      return NextResponse.json({ error: "DART 기능이 관리자에 의해 비활성화되었습니다.", disabled: true }, { status: 503 });
    }
    if (!(await isDartOpen())) {
      return NextResponse.json({ error: "DART 기능이 설정된 시간 외에는 동작하지 않습니다.", disabled: true }, { status: 503 });
    }
    await syncDartAlerts();
    const payload = await getTodayDartBullishFeed();
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "DART 데이터를 불러오지 못했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
