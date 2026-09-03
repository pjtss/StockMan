import { NextResponse } from "next/server";
import { runKrAccumulationScreener } from "@/lib/kr-accumulation-screener";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try { const raw = Number(new URL(request.url).searchParams.get("limit") ?? 100); const limit = Number.isFinite(raw) ? Math.min(100, Math.max(1, Math.trunc(raw))) : 100; const results = await runKrAccumulationScreener(limit); return NextResponse.json({ ok: true, results, count: results.length, criteria: "OBV·ADL 20일 상승, 최근 5일 거래량·거래대금 증가, 양봉 거래량 우세, 20일 변동률 ±10% 이내, EMA(9/20) 위, RVOL 1.0 이상, 시총 500억 이상" }); }
  catch { return NextResponse.json({ ok: false, error: "KR_ACCUMULATION_UNAVAILABLE" }, { status: 503 }); }
}
