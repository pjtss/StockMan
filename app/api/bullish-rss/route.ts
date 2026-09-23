import { NextResponse } from "next/server";
import { listMarketRssBullishArticles } from "@/lib/market-rss-bullish-repository";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const source = params.get("source")?.trim().toUpperCase() || undefined;
  const limit = Number(params.get("limit") || 200);
  try {
    const articles = await listMarketRssBullishArticles({ source, limit });
    return NextResponse.json({ ok: true, source: source || "ALL", count: articles.length, articles });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 503 });
  }
}
