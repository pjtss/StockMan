import { NextResponse } from "next/server";
import { loadUsTopRisingScopes } from "@/lib/us-top-rising-universe";
import { saveUsTopRisingSnapshot } from "@/lib/us-top-rising-snapshot";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await loadUsTopRisingScopes();
    let snapshotId: string | null = null;
    let snapshotError: string | null = null;
    try {
      // Do not overwrite the last useful snapshot with a normal empty response
      // (for example outside US market hours or during a provider pause).
      if (result.scopes.length > 0) {
        snapshotId = await saveUsTopRisingSnapshot({ ok: result.universe.ok, markets: result.universe.markets, scopes: result.scopes });
      }
    } catch (error) {
      snapshotError = error instanceof Error ? error.message : "SNAPSHOT_SAVE_FAILED";
      console.warn("[US TOP RISING] snapshot save failed:", snapshotError);
    }
    return NextResponse.json({ ok: result.universe.ok, complete: result.universe.complete, snapshotId, snapshotError, items: result.scopes, requestedTopN: 100, topNPerExchange: 100, commonStockCount: result.scopes.length, markets: result.universe.markets, criteria: result.universe.criteria, message: result.scopes.length > 0 ? undefined : "정상 응답이지만 현재 조회 가능한 상승률 데이터가 없습니다. 미국 시장 시간과 KIS 순위 제공 여부를 확인하세요.", collectedAt: new Date().toISOString() }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, items: [], error: error instanceof Error ? error.message : "US_TOP_RISING_UNAVAILABLE" }, { status: 502 });
  }
}
