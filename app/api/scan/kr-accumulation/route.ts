import { NextResponse } from "next/server";
import { runKrAccumulationScreener } from "@/lib/kr-accumulation-screener";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try { const raw = Number(new URL(request.url).searchParams.get("limit") ?? 100); const limit = Number.isFinite(raw) ? Math.min(100, Math.max(1, Math.trunc(raw))) : 100; const results = await runKrAccumulationScreener(limit); return NextResponse.json({ ok: true, results, count: results.length, criteria: "국내 활성 보통주, 시총 300억 초과, 최신 일봉 RVOL 2 이상, OBV·ADL 20일 상승, RVOL 내림차순" }); }
  catch { return NextResponse.json({ ok: false, error: "KR_ACCUMULATION_UNAVAILABLE" }, { status: 503 }); }
}
