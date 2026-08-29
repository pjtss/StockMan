import { NextResponse } from "next/server";
import { refreshKrCommonMinuteCandles } from "@/lib/kr-minute-refresh";

export async function POST(request: Request) {
  const secret = process.env.ADMIN_DASHBOARD_PASSWORD?.trim();
  if (!secret || request.headers.get("x-admin-password")?.trim() !== secret) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const result = await refreshKrCommonMinuteCandles({ limit: Number(body.limit ?? 1200), concurrency: Number(body.concurrency ?? 4) });
  return NextResponse.json(result);
}
