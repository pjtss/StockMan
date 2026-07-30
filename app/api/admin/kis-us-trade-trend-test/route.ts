import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { fetchKisUsTradeTrend } from "@/lib/kis-us-trade-trend";

export async function GET(request: Request) {
  if (!(await requireAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const p = new URL(request.url).searchParams; const code = (p.get("code") || "").trim().toUpperCase(); const market = (p.get("market") || "NAS").toUpperCase(); const day = p.get("day") === "0" ? "0" : "1";
  if (!code) return NextResponse.json({ error: "종목코드를 입력하세요." }, { status: 400 });
  if (!["NAS", "NYSE", "AMS"].includes(market)) return NextResponse.json({ error: "지원하지 않는 거래소입니다." }, { status: 400 });
  const result = await fetchKisUsTradeTrend({ code, market: market as "NAS" | "NYSE" | "AMS", day });
  if (!result) return NextResponse.json({ error: "KIS access token is unavailable" }, { status: 500 });
  return NextResponse.json({ ok: result.ok, status: result.status, request: { method: "GET", endpoint: "/uapi/overseas-price/v1/quotations/inquire-ccnl", tr_id: "HHDFS76200300", params: { EXCD: market, SYMB: code, TDAY: day, AUTH: "", KEYB: "" } }, diagnostics: result.diagnostics, trades: result.trades, raw: result.raw, rawText: result.rawText });
}
