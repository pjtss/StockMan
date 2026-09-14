import { NextResponse } from "next/server";
import { intradayMemoryState } from "@/lib/intraday-memory-state";

export const dynamic = "force-dynamic";

export async function GET() {
  const snapshot = intradayMemoryState.snapshot();
  const items = snapshot.current.filter((item) => item.market === "KOSPI" || item.market === "KOSDAQ");
  return NextResponse.json({ ok: items.length > 0, source: "INTRADAY_MEMORY", items, collectedAt: items.length ? new Date().toISOString() : null, message: items.length ? undefined : "현재 메모리에 국내 상승률 TOP100 데이터가 없습니다." }, { headers: { "Cache-Control": "no-store" } });
}
