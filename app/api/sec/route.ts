import { NextResponse } from "next/server";
import { getTodaySecBullishFeed, syncSecAlerts } from "@/lib/sec-alerts";
import { loadAdminFeatureFlags } from "@/lib/admin-flags";

export const dynamic = "force-dynamic";

export async function GET() {
  const flags = await loadAdminFeatureFlags();
  if (!flags.sec_realtime) {
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
    const message = error instanceof Error ? error.message : "SEC 데이터를 불러오지 못했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
