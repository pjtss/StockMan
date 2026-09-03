import { NextResponse } from "next/server";
import { fetchAmsScoutCandidates } from "@/lib/kis-ams-scout";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await fetchAmsScoutCandidates();
    return NextResponse.json(result, {
      status: result.ok ? 200 : result.status,
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch {
    return NextResponse.json({ ok: false, error: "US_AMS_SCOUT_UNAVAILABLE" }, { status: 503, headers: { "Cache-Control": "no-store, max-age=0" } });
  }
}
