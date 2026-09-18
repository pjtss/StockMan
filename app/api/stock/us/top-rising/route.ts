import { NextResponse } from "next/server";
import { fetchKisUsTopRisingApi } from "@/lib/kis-us-api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const result = await fetchKisUsTopRisingApi({
      excd: url.searchParams.get("excd") || undefined,
      gubn: url.searchParams.get("gubn") || undefined,
      nday: url.searchParams.get("nday") || undefined,
      // The endpoint represents the exchange TOP100 universe. VOL_RANG=5 can
      // return a successful but truncated page (for example only six NAS rows)
      // during live sessions, so the default must request the full ranking.
      volRang: url.searchParams.get("volRang") || "0",
    });

    if (!result) return NextResponse.json({ ok: false, error: "US_TOP_RISING_UNAVAILABLE" }, { status: 503 });

    const parsed = result.response.parsed as any;
    const output = [parsed?.output, parsed?.output2, parsed?.output1].find(Array.isArray) ?? [];

    return NextResponse.json(output, { status: result.ok ? 200 : result.status, headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch { return NextResponse.json({ ok: false, error: "US_TOP_RISING_UNAVAILABLE" }, { status: 503 }); }
}
