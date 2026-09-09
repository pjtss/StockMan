import { NextResponse } from "next/server";
import { loadUsTopRisingScopes } from "@/lib/us-top-rising-universe";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await loadUsTopRisingScopes();
    return NextResponse.json({ ok: result.universe.ok, items: result.scopes, requestedTopN: 100, commonStockCount: result.scopes.length, markets: result.universe.markets, criteria: result.universe.criteria, collectedAt: new Date().toISOString() }, { status: result.universe.ok ? 200 : 502, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, items: [], error: error instanceof Error ? error.message : "US_TOP_RISING_UNAVAILABLE" }, { status: 502 });
  }
}
