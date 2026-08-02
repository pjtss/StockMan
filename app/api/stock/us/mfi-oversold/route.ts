import { NextResponse } from "next/server";
import { scanStoredUsMfiOversold } from "@/lib/us-mfi-oversold";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const result = await scanStoredUsMfiOversold({
    period: params.has("period") ? Number(params.get("period")) : undefined,
    threshold: params.has("threshold") ? Number(params.get("threshold")) : undefined,
  });
  return NextResponse.json({ ok: true, ...result });
}
