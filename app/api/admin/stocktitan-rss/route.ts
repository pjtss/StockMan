import { and, asc, desc, eq, gte, lt } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { getDb } from "@/lib/db";
import { marketRssArticles } from "@/lib/schema";
import { getMarketRssGrade, isMarketRssGrade, MARKET_RSS_GRADE_LABELS, type MarketRssGrade } from "@/lib/market-rss-grade";
import { MARKET_RSS_SOURCES, type MarketRssSource } from "@/lib/market-rss-sources";

function kstDayBounds(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("date must be YYYY-MM-DD");
  const start = new Date(`${value}T00:00:00+09:00`);
  if (Number.isNaN(start.getTime())) throw new Error("invalid date");
  return { start, end: new Date(start.getTime() + 86_400_000) };
}

export async function GET(request: Request) {
  if (!(await requireAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const searchParams = new URL(request.url).searchParams;
  const date = searchParams.get("date") || new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
  const sourceValue = (searchParams.get("source") || "STOCKTITAN").toUpperCase();
  const gradeValue = (searchParams.get("grade") || "all").toLowerCase();
  if (!MARKET_RSS_SOURCES.includes(sourceValue as MarketRssSource)) return NextResponse.json({ ok: false, error: "지원하지 않는 RSS source", sources: MARKET_RSS_SOURCES }, { status: 400 });
  if (gradeValue !== "all" && !isMarketRssGrade(gradeValue)) return NextResponse.json({ ok: false, error: "지원하지 않는 호재 등급", grades: ["all", ...Object.keys(MARKET_RSS_GRADE_LABELS)] }, { status: 400 });
  try {
    const { start, end } = kstDayBounds(date);
    const conditions = [eq(marketRssArticles.source, sourceValue), gte(marketRssArticles.publishedAt, start), lt(marketRssArticles.publishedAt, end)];
    const grade = gradeValue === "all" ? null : gradeValue as MarketRssGrade;
    if (grade === "high" || grade === "medium" || grade === "low") {
      conditions.push(eq(marketRssArticles.notifyEligible, true));
      if (grade === "high") conditions.push(gte(marketRssArticles.priority, 100));
      if (grade === "medium") { conditions.push(gte(marketRssArticles.priority, 50)); conditions.push(lt(marketRssArticles.priority, 100)); }
      if (grade === "low") conditions.push(lt(marketRssArticles.priority, 50));
    }
    if (grade === "excluded") conditions.push(eq(marketRssArticles.notifyEligible, false));
    const rows = await getDb().select().from(marketRssArticles).where(and(...conditions)).orderBy(desc(marketRssArticles.priority), desc(marketRssArticles.publishedAt), asc(marketRssArticles.id));
    const articles = rows.map((row) => ({ ...row, grade: getMarketRssGrade(row) }));
    return NextResponse.json({ ok: true, source: sourceValue, date, grade: gradeValue, timezone: "Asia/Seoul", count: articles.length, articles });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
