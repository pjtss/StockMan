import { NextResponse } from "next/server";
import { loadUsTopRisingScopes } from "@/lib/us-top-rising-universe";
import { saveUsTopRisingSnapshot } from "@/lib/us-top-rising-snapshot";
import { intradayMemoryState } from "@/lib/intraday-memory-state";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const memoryItems = intradayMemoryState.snapshot().current.filter((item) => ["NAS", "AMS", "NYS"].includes(item.market));
    // The worker already maintains the live TOP100 universe in memory. Avoid
    // re-running three KIS ranking calls and the market-cap query on every
    // page load; hydrate from KIS only when this process has no snapshot yet.
    const result = memoryItems.length > 0 ? null : await loadUsTopRisingScopes();
    const items = memoryItems.length > 0 ? memoryItems : result?.scopes ?? [];
    let snapshotId: string | null = null;
    let snapshotError: string | null = null;
    try {
      // Do not overwrite the last useful snapshot with a normal empty response
      // (for example outside US market hours or during a provider pause).
      if (items.length > 0) {
        if (result) snapshotId = await saveUsTopRisingSnapshot({ ok: result.universe.ok, markets: result.universe.markets, scopes: result.scopes });
      }
    } catch (error) {
      snapshotError = error instanceof Error ? error.message : "SNAPSHOT_SAVE_FAILED";
      console.warn("[US TOP RISING] snapshot save failed:", snapshotError);
    }
    return NextResponse.json({ ok: memoryItems.length > 0 ? true : Boolean(result?.universe.ok), complete: memoryItems.length > 0 ? true : Boolean(result?.universe.complete), snapshotId, snapshotError, source: memoryItems.length > 0 ? "INTRADAY_MEMORY" : "KIS_TOP_RISING_HYDRATION", items, requestedTopN: 100, topNPerExchange: 100, commonStockCount: items.length, markets: result?.universe.markets ?? [], criteria: result?.universe.criteria ?? { source: "INTRADAY_MEMORY" }, message: items.length > 0 ? undefined : "현재 메모리에 조회 가능한 상승률 데이터가 없습니다.", collectedAt: new Date().toISOString() }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, items: [], error: error instanceof Error ? error.message : "US_TOP_RISING_UNAVAILABLE" }, { status: 502 });
  }
}
