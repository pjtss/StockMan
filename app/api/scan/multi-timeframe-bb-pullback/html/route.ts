import { NextResponse } from "next/server";
import { scanMultiTimeframeBbPullback } from "@/lib/multi-timeframe-bb-pullback";
import { renderMultiTimeframeBbHtml } from "@/lib/multi-timeframe-bb-html";
import { verifyBbExportToken } from "@/lib/bb-export-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url); const market = (url.searchParams.get("market") || "ALL").toUpperCase();
  if (!["KR", "US", "ALL"].includes(market) || !verifyBbExportToken(market, url.searchParams.get("token"))) return NextResponse.json({ ok: false, error: "유효하지 않거나 만료된 다운로드 링크입니다." }, { status: 401 });
  const markets = market === "ALL" ? ["KR", "US"] : [market];
  const results = await Promise.all(markets.map((item) => scanMultiTimeframeBbPullback(item as "KR" | "US")));
  const generatedAt = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul", dateStyle: "short", timeStyle: "medium" }).format(new Date());
  return new NextResponse(renderMultiTimeframeBbHtml(results, generatedAt), { headers: { "content-type": "text/html; charset=utf-8", "content-disposition": `attachment; filename="stockman-bb-${market.toLowerCase()}.html"` } });
}
