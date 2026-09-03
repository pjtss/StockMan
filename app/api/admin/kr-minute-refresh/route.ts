import { NextResponse } from "next/server";
import { refreshKrCommonMinuteCandles } from "@/lib/kr-minute-refresh";

export async function POST(request: Request) {
  const secret = process.env.ADMIN_DASHBOARD_PASSWORD?.trim();
  if (!secret || request.headers.get("x-admin-password")?.trim() !== secret) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const rawLimit = Number(body.limit ?? 1200);
  const rawConcurrency = Number(body.concurrency ?? 4);
  const limit = Number.isFinite(rawLimit) ? Math.min(5000, Math.max(1, Math.trunc(rawLimit))) : 1200;
  const concurrency = Number.isFinite(rawConcurrency) ? Math.min(8, Math.max(1, Math.trunc(rawConcurrency))) : 4;
  try {
    const result = await refreshKrCommonMinuteCandles({ limit, concurrency });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ ok: false, error: "KR_MINUTE_REFRESH_FAILED" }, { status: 502 });
  }
}
