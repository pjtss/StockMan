import { NextResponse } from "next/server";
import { isCronRequestAuthorized } from "@/lib/cron-auth";
import { listMarketRssBullishArticles, upsertMarketRssBullishArticles } from "@/lib/market-rss-bullish-repository";
import { safeErrorMetadata } from "@/lib/error-diagnostics";

export const dynamic = "force-dynamic";

function authorized(request: Request) {
  return isCronRequestAuthorized(request);
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const rawSource = params.get("source");
  const source = rawSource?.trim().toUpperCase() || undefined;
  if (rawSource !== null && (!source || source.length > 64 || !/^[A-Z0-9_:-]+$/.test(source))) {
    return NextResponse.json({ ok: false, error: "INVALID_SOURCE" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const rawLimit = params.get("limit");
  const limit = rawLimit === null || rawLimit.trim() === "" ? 200 : (/^\d+$/.test(rawLimit) ? Number(rawLimit) : Number.NaN);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) {
    return NextResponse.json({ ok: false, error: "INVALID_LIMIT" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const articles = await listMarketRssBullishArticles({ source, limit });
    return NextResponse.json({ ok: true, source: source || "ALL", count: articles.length, articles }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: safeErrorMetadata(error).errorCode }, { status: 503 });
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
    if (error instanceof SyntaxError) return NextResponse.json({ ok: false, error: "INVALID_JSON" }, { status: 400 });
    return NextResponse.json({ ok: false, error: safeErrorMetadata(error).errorCode }, { status: 503 });
  }
}
