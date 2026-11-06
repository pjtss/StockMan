import { NextResponse } from "next/server";
import { listStockmanCollectionStatus } from "@/lib/stockman-events";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ ok: true, asOf: new Date().toISOString(), sources: await listStockmanCollectionStatus() }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, error: "COLLECTION_STATUS_UNAVAILABLE" }, { status: 503 });
  }
}
