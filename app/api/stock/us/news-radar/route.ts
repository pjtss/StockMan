import { NextResponse } from "next/server";
import { detectNewsCandidates } from "@/lib/kis-news-radar";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const result = await detectNewsCandidates({ date: params.get("date") || undefined, time: params.get("time") || undefined });
    return NextResponse.json({ ok: true, ...result });
  } catch {
    return NextResponse.json({ ok: false, error: "US_NEWS_RADAR_UNAVAILABLE" }, { status: 503 });
  }
}
