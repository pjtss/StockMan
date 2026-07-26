import { NextResponse } from "next/server";
import { getHealthSnapshot } from "@/lib/health-check";

export const dynamic = "force-dynamic";

export async function GET() {
  const snapshot = await getHealthSnapshot();
  return NextResponse.json(snapshot, { status: snapshot.status === "ok" ? 200 : 503, headers: { "cache-control": "no-store" } });
}
