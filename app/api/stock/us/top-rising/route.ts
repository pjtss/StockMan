import { NextResponse } from "next/server";
import { fetchKisUsTopRisingApi } from "@/lib/kis-us-api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const result = await fetchKisUsTopRisingApi({
    excd: url.searchParams.get("excd") || undefined,
    gubn: url.searchParams.get("gubn") || undefined,
    nday: url.searchParams.get("nday") || undefined,
    volRang: url.searchParams.get("volRang") || undefined,
  });

  if (!result) {
    return NextResponse.json({ error: "KIS access token is unavailable" }, { status: 500 });
  }

  const output = Array.isArray((result.response.parsed as any)?.output)
    ? (result.response.parsed as any).output
    : [];

  return NextResponse.json(output, {
    status: result.ok ? 200 : result.status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
