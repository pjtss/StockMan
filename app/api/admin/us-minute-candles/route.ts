import { NextResponse } from "next/server";
import { refreshUsMinuteCandles } from "@/lib/us-minute-candle-cache";

export async function POST(request: Request) {
  const secret = process.env.ADMIN_DASHBOARD_PASSWORD?.trim();
  const supplied = request.headers.get("x-admin-password")?.trim();
  if (!secret || supplied !== secret) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });

  const body = await request.json().catch(() => null) as { market?: unknown; code?: unknown } | null;
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ ok: false, error: "INVALID_INPUT" }, { status: 400 });
  const market = String(body.market ?? "NAS").toUpperCase();
  const code = String(body.code ?? "").trim().toUpperCase();
  if (!/^(NAS|NYS|AMS)$/.test(market) || !code || code.length > 32 || !/^[A-Z0-9./_-]+$/.test(code)) {
    return NextResponse.json({ ok: false, error: "INVALID_INPUT" }, { status: 400 });
  }
  try {
    return NextResponse.json({ ok: true, market, code, ...await refreshUsMinuteCandles(market, code) });
  } catch (error) {
    console.error("[API /admin/us-minute-candles] Error:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ ok: false, error: "US_MINUTE_CANDLES_REFRESH_FAILED" }, { status: 502 });
  }
}
