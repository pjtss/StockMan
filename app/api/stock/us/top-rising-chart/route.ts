import { NextResponse } from "next/server";
import { getCachedUsTopRisingScopes, loadUsTopRisingScopes } from "@/lib/us-top-rising-universe";
import { saveUsTopRisingSnapshot } from "@/lib/us-top-rising-snapshot";
import { intradayMemoryState } from "@/lib/intraday-memory-state";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const memoryItems = intradayMemoryState.snapshot().current.filter((item) => ["NAS", "AMS", "NYS"].includes(item.market));
    // Reuse the worker's last upstream result (including exchange diagnostics
    // and original collection time). Hydrate only on a cold process start.
    const cached = getCachedUsTopRisingScopes();
    const result = cached ?? (memoryItems.length === 0 ? await loadUsTopRisingScopes() : null);
    const items = result ? result.scopes : memoryItems;
    let snapshotId: string | null = null;
    let snapshotError: string | null = null;
    try {
      // Persist only a newly hydrated result, not every UI read of the cache.
      if (!cached && result && items.length > 0) {
        snapshotId = await saveUsTopRisingSnapshot({ ok: result.universe.ok, markets: result.universe.markets, scopes: result.scopes });
      }
    } catch (error) {
      snapshotError = error instanceof Error ? error.message : "SNAPSHOT_SAVE_FAILED";
      console.warn("[US TOP RISING] snapshot save failed:", snapshotError);
    }
    const collectedAt = result?.universe.collectedAt ?? null;
    const collectedAtMs = collectedAt ? Date.parse(collectedAt) : NaN;
    const ageSeconds = Number.isFinite(collectedAtMs) ? Math.max(0, Math.floor((Date.now() - collectedAtMs) / 1000)) : null;
    const markets = result?.universe.markets.map((market: any) => ({
      market: market.market,
      status: market.status,
      responseOk: market.responseOk,
      sourceCount: market.sourceCount,
      requestedCount: 100,
      sourceComplete: market.sourceComplete,
      selectedCount: market.selectedCount,
      eligibleCommonStockCount: market.eligibleCommonStockCount ?? 0,
      productExcluded: market.productExcluded,
      invalidRows: market.invalidRows ?? 0,
      duplicateExcluded: market.duplicateExcluded ?? 0,
      fallbackUsed: market.fallbackUsed,
      collectedAt: market.collectedAt,
      error: market.error,
      warning: market.warning,
      kis: market.kis,
    })) ?? [];
    return NextResponse.json({
      ok: result ? Boolean(result.universe.ok) : items.length > 0,
      complete: Boolean(result?.universe.complete),
      snapshotId,
      snapshotError,
      source: cached ? "KIS_TOP_RISING_PROCESS_CACHE" : "KIS_TOP_RISING_HYDRATION",
      items,
      requestedTopN: 100,
      topNPerExchange: 100,
      commonStockCount: items.length,
      markets,
      availableMarketCount: result?.universe.availableMarketCount ?? 0,
      completeMarketCount: result?.universe.completeMarketCount ?? 0,
      criteria: result?.universe.criteria ?? {},
      message: items.length > 0 ? undefined : "현재 표시 가능한 상승률 종목이 없습니다. 시장 응답·거래시간·보통주 마스터 상태를 확인하세요.",
      collectedAt,
      ageSeconds,
      stale: ageSeconds == null || ageSeconds > 60,
    }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, items: [], error: error instanceof Error ? error.message : "US_TOP_RISING_UNAVAILABLE" }, { status: 502 });
  }
}
