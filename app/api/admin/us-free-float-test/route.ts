import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { getUsFreeFloat } from "@/lib/us-free-float";

export async function GET(request: Request) {
  if (!(await requireAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ticker = new URL(request.url).searchParams.get("ticker")?.trim().toUpperCase() || "";
  const market = new URL(request.url).searchParams.get("market")?.trim().toUpperCase() || undefined;
  if (!ticker) return NextResponse.json({ error: "티커를 입력하세요." }, { status: 400 });
  const result = await getUsFreeFloat(ticker, market);
  return NextResponse.json({ ok: result.ok, request: { method: "GET", endpoint: result.source === "SEC" ? "SEC Company Facts" : "/stable/shares-float", ticker, market: market ?? null }, result, diagnostics: { source: result.source, dataType: result.dataType ?? (result.source === "SEC" ? "OUTSTANDING_SHARES" : "FREE_FLOAT"), asOf: result.asOf, cached: result.cached, freeFloatAvailable: result.floatShares != null, exchangeMatching: Boolean(market) } });
}
