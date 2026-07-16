import { NextResponse } from "next/server";
import { loadAdminFeatureFlags } from "@/lib/admin-flags";
import { isUsTurnoverRatioOpen } from "@/lib/scanner-hours";
import { fetchUsTurnoverRatioScanner } from "@/lib/us-turnover-ratio";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const flags = await loadAdminFeatureFlags();
  if (!flags.us_turnover_ratio) {
    return NextResponse.json({ error: "시총 대비 거래대금 스캐너가 비활성화되어 있습니다." }, { status: 503 });
  }
  if (!(await isUsTurnoverRatioOpen())) {
    return NextResponse.json({ error: "시총 대비 거래대금 스캐너 운영 시간이 아닙니다." }, { status: 503 });
  }

  const url = new URL(request.url);
  const result = await fetchUsTurnoverRatioScanner({
    excd: url.searchParams.get("excd") || undefined,
    gubn: url.searchParams.get("gubn") || undefined,
    nday: url.searchParams.get("nday") || undefined,
    volRang: url.searchParams.get("volRang") || undefined,
  }, ["AMS", "NAS"]);
  if (!result) return NextResponse.json({ error: "KIS access token is unavailable" }, { status: 500 });
  return NextResponse.json(result.filtered, { status: result.ok ? 200 : result.status, headers: { "Cache-Control": "no-store" } });
}
