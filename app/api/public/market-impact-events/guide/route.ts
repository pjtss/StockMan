import { NextResponse } from "next/server";
import guide from "@/data/market-impact-event-guide.json";

export const dynamic = "force-static";

export async function GET() {
  return NextResponse.json(
    { ok: true, ...guide },
    { headers: { "cache-control": "public, max-age=300, stale-while-revalidate=3600" } },
  );
}
