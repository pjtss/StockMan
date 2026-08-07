import { and, asc, desc, gte, lt, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { getDb } from "@/lib/db";
import { marketRssArticles } from "@/lib/schema";

function kstDayBounds(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("date must be YYYY-MM-DD");
  const start = new Date(`${value}T00:00:00+09:00`);
  if (Number.isNaN(start.getTime())) throw new Error("invalid date");
  return { start, end: new Date(start.getTime() + 86_400_000) };
}

export async function GET(request: Request) {
  if (!(await requireAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const date = new URL(request.url).searchParams.get("date") || new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
  try {
    const { start, end } = kstDayBounds(date);
    const rows = await getDb().select().from(marketRssArticles).where(and(eq(marketRssArticles.source, "STOCKTITAN"), gte(marketRssArticles.publishedAt, start), lt(marketRssArticles.publishedAt, end))).orderBy(desc(marketRssArticles.publishedAt), asc(marketRssArticles.id));
    return NextResponse.json({ ok: true, source: "STOCKTITAN", date, timezone: "Asia/Seoul", count: rows.length, articles: rows });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
