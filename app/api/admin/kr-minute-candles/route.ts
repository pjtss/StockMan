import { NextResponse } from "next/server";
import { fetchKrMinuteCandles, saveKrMinuteCandles } from "@/lib/kr-minute-candle-cache";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})); const code = String(body.code ?? "").trim(); const market = body.market === "KOSDAQ" ? "KOSDAQ" : "KOSPI";
  if (!/^\d{6}$/.test(code)) return NextResponse.json({ ok: false, error: "code must be a 6-digit domestic ticker" }, { status: 400 });
  try { const rows = await fetchKrMinuteCandles(code, Math.min(100, Math.max(1, Number(body.limit ?? 30))), market); const saved = await saveKrMinuteCandles(market, code, rows); return NextResponse.json({ ok: true, market, code, fetched: rows.length, saved, latest: rows[0] ?? null }); } catch (error) { return NextResponse.json({ ok: false, market, code, error: error instanceof Error ? error.message : String(error) }, { status: 502 }); }
}
