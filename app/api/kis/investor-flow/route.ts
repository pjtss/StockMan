import { NextResponse } from "next/server";
import { getAccessToken } from "@/lib/kis-token";
import { fetchInvestorByStock, fetchInvestorTrendEstimate, fetchProgramTradeByStock } from "@/lib/kis-investor-flow";

export const dynamic = "force-dynamic";

type Mode = "investor" | "estimate" | "program";

function readMode(value: string | null): Mode {
  if (value === "estimate" || value === "program") return value;
  return "investor";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = (url.searchParams.get("code") ?? "").trim();
  const market = (url.searchParams.get("market") ?? "J").trim() || "J";
  const mode = readMode(url.searchParams.get("mode"));
  const collectedAt = new Date().toISOString();

  if (!/^\d{6}$/.test(code)) {
    return NextResponse.json({ ok: false, error: "INVALID_STOCK_CODE", collectedAt }, { status: 400 });
  }

  try {
    const token = await getAccessToken();
    if (!token) return NextResponse.json({ ok: false, error: "KIS_TOKEN_UNAVAILABLE", collectedAt }, { status: 503 });

    const result = mode === "estimate"
      ? await fetchInvestorTrendEstimate(token, code)
      : mode === "program"
        ? await fetchProgramTradeByStock(token, code, market)
        : await fetchInvestorByStock(token, code, market);

    return NextResponse.json({
      ok: result.ok,
      source: "KIS",
      market,
      code,
      mode,
      flowStatus: mode === "estimate" ? "ESTIMATED" : "CONFIRMED",
      collectedAt,
      rows: result.rows,
      diagnostics: { status: result.status, rtCd: result.rtCd, msgCd: result.msgCd, msg1: result.msg1 },
    }, { status: result.ok ? 200 : 502 });
  } catch (error) {
    return NextResponse.json({ ok: false, source: "KIS", market, code, mode, flowStatus: "UNAVAILABLE", collectedAt, error: error instanceof Error ? error.message.slice(0, 500) : "KIS_REQUEST_FAILED" }, { status: 502 });
  }
}
