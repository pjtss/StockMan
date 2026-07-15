import { NextResponse } from "next/server";
import { loadAdminFeatureFlags } from "@/lib/admin-flags";
import { fetchUsMinuteTurnover } from "@/lib/kis-us-minute-turnover";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const flags = await loadAdminFeatureFlags();
  if (!flags.us_turnover_trend) {
    return NextResponse.json({ error: "해외주식 거래대금 추이 기능이 비활성화되었습니다." }, { status: 503 });
  }

  const url = new URL(request.url);
  const code = (url.searchParams.get("code") || "").trim().toUpperCase();
  const market = (url.searchParams.get("market") || "AMS").trim().toUpperCase();
  if (!code) return NextResponse.json({ error: "code is required" }, { status: 400 });

  const result = await fetchUsMinuteTurnover({ code, market });
  if (!result) return NextResponse.json({ error: "KIS access token is unavailable" }, { status: 500 });
  return NextResponse.json(result);
}
