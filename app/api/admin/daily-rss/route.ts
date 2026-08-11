import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { loadDailyMarketRssExport } from "@/lib/daily-market-rss-export";

export async function GET(request: Request) {
  if (!(await requireAdminSession())) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const date = new URL(request.url).searchParams.get("date") || new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
  try {
    return NextResponse.json(await loadDailyMarketRssExport(date));
  } catch (error) {
    return NextResponse.json({ ok: false, date, error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
