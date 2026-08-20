import { NextResponse } from "next/server";
import { readKisCache } from "@/lib/kis-cache";

type CachedGoldenCross = {
  scope?: string;
  timeframe?: string;
  updatedAt?: string;
  qualifiedCount?: number;
  scannedCount?: number;
  qualified?: Array<{ market?: string; code?: string; name?: string; reason?: string }>;
};

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const supplied = request.headers.get("x-cron-secret") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!secret || supplied !== secret) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  const scopes = ["KR", "US"] as const;
  const caches = await Promise.all(scopes.map(async (scope) => {
    const key = `daily-golden-cross:${scope}:D`;
    const data = await readKisCache<CachedGoldenCross>(key);
    return {
      scope,
      key,
      exists: Boolean(data),
      updatedAt: data?.updatedAt ?? null,
      timeframe: data?.timeframe ?? null,
      scannedCount: data?.scannedCount ?? 0,
      qualifiedCount: data?.qualifiedCount ?? 0,
      sample: (data?.qualified ?? []).slice(0, 5).map(({ market, code, name, reason }) => ({ market, code, name, reason })),
    };
  }));
  return NextResponse.json({ ok: true, checkedAt: new Date().toISOString(), caches });
}
