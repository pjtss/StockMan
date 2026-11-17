import { NextResponse } from "next/server";
import { intradayMemoryState } from "@/lib/intraday-memory-state";
import { getAccessToken } from "@/lib/kis-token";
import { fetchDomesticFluctuation } from "@/lib/kis-domestic-api";
import { normalizeKrTopRisingRows } from "@/lib/kr-top-rising";
import { safeErrorMetadata } from "@/lib/error-diagnostics";
import { filterActiveKrCommonStockRows } from "@/lib/instrument-eligibility";
import { filterKrRowsByStoredMarketCap, KR_MARKET_CAP_MAX_AGE_HOURS } from "@/lib/kr-market-cap";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const snapshot = intradayMemoryState.snapshot();
    const memoryItems = snapshot.current.filter((item) => item.market === "KOSPI" || item.market === "KOSDAQ");
    if (memoryItems.length > 0) {
      let eligibleMemoryItems;
      try { eligibleMemoryItems = await filterActiveKrCommonStockRows(memoryItems); }
      catch { return NextResponse.json({ ok: false, error: "COMMON_STOCK_UNIVERSE_UNAVAILABLE", source: "LOCAL_DB", eligibility: { failClosed: true }, items: [] }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
      try { eligibleMemoryItems = await filterKrRowsByStoredMarketCap(eligibleMemoryItems); }
      catch { return NextResponse.json({ ok: false, error: "MARKET_CAP_SNAPSHOT_UNAVAILABLE", source: "LOCAL_DB", marketCapFilter: { failClosed: true }, items: [] }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
      if (eligibleMemoryItems.length > 0) return NextResponse.json({ ok: true, source: "INTRADAY_MEMORY", marketCapFilter: { minimumKrwExclusive: 30_000_000_000, maxSnapshotAgeHours: KR_MARKET_CAP_MAX_AGE_HOURS, unknownOrStale: "excluded" }, items: eligibleMemoryItems, collectedAt: new Date().toISOString(), message: undefined }, { headers: { "Cache-Control": "no-store" } });
    }

    // The worker is intentionally disabled outside the configured session.
    // Hydrate the chart from KIS in that case so the weekend/after-hours view
    // still exposes the provider's last successful ranking response.
    const token = await getAccessToken();
    if (!token) {
      return NextResponse.json({ ok: false, source: "KIS_LAST_RANKING_UNAVAILABLE", items: [], collectedAt: null, message: "KIS 인증 토큰이 없어 국내 상승률 데이터를 조회할 수 없습니다." }, { headers: { "Cache-Control": "no-store" } });
    }
    const observedAt = new Date().toISOString();
    const rows = await fetchDomesticFluctuation(token);
    let eligibleRows;
    try { eligibleRows = await filterActiveKrCommonStockRows(rows as unknown as Array<Record<string, unknown>>, (row) => row.mksc_shrn_iscd ?? row.stck_shrn_iscd ?? row.code); }
    catch { return NextResponse.json({ ok: false, error: "COMMON_STOCK_UNIVERSE_UNAVAILABLE", source: "LOCAL_DB", eligibility: { failClosed: true }, items: [] }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
    try { eligibleRows = await filterKrRowsByStoredMarketCap(eligibleRows, (row) => row.mksc_shrn_iscd ?? row.stck_shrn_iscd ?? row.code); }
    catch { return NextResponse.json({ ok: false, error: "MARKET_CAP_SNAPSHOT_UNAVAILABLE", source: "LOCAL_DB", marketCapFilter: { failClosed: true }, items: [] }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
    const items = normalizeKrTopRisingRows(eligibleRows, observedAt);
    return NextResponse.json({ ok: items.length > 0, source: "KIS_LAST_RANKING", marketCapFilter: { minimumKrwExclusive: 30_000_000_000, maxSnapshotAgeHours: KR_MARKET_CAP_MAX_AGE_HOURS, unknownOrStale: "excluded" }, items, collectedAt: items.length ? observedAt : null, message: items.length ? "장외 시간에는 KIS가 반환한 마지막 정상 상승률 순위를 표시합니다." : "KIS가 국내 상승률 순위를 반환하지 않았습니다." }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, source: "KIS_LAST_RANKING_UNAVAILABLE", items: [], error: safeErrorMetadata(error).errorCode }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
