import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { collectUsTradeIntensity } from "@/lib/us-trade-intensity-collector";

export async function GET(request: Request) {
  if (!(await requireAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const symbols = (params.get("symbols") || "").split(",").map((symbol) => symbol.trim()).filter(Boolean);
  if (symbols.length === 0) return NextResponse.json({ error: "티커를 하나 이상 입력하세요." }, { status: 400 });
  const market = (params.get("market") || "").toUpperCase();
  if (market && !["NAS", "AMS", "NYS"].includes(market)) return NextResponse.json({ error: "지원하지 않는 거래소입니다. (NAS, AMS, NYS)" }, { status: 400 });
  const maxSymbols = Number(params.get("maxSymbols"));
  const delayMs = Number(params.get("delayMs"));
  const result = await collectUsTradeIntensity(symbols, { market: market ? market as "NAS" | "AMS" | "NYS" : undefined, maxSymbols: Number.isFinite(maxSymbols) ? maxSymbols : 10, delayMs: Number.isFinite(delayMs) ? delayMs : 350 });
  return NextResponse.json({ ok: result.failureCount === 0, request: { symbols, market: market || null, maxSymbols, delayMs }, result, discordSent: false });
}
