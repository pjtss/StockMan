import { NextResponse } from "next/server";
import { isCronRequestAuthorized } from "@/lib/cron-auth";
import { listMarketRssBullishArticles, upsertMarketRssBullishArticles } from "@/lib/market-rss-bullish-repository";

export const dynamic = "force-dynamic";

function authorized(request: Request) {
  return isCronRequestAuthorized(request);
}

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

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  try {
    const body = await request.json() as { articles?: unknown };
    if (!Array.isArray(body.articles) || body.articles.length > 5000) return NextResponse.json({ ok: false, error: "INVALID_ARTICLES" }, { status: 400 });
    const result = await upsertMarketRssBullishArticles(body.articles as Parameters<typeof upsertMarketRssBullishArticles>[0]);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
