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

const excludedKrName = /(?:스팩|SPAC|우선주|우(?:\(|$)|\d우B(?:\(|$)|전환|신주인수권|권리주)/i;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const supplied = request.headers.get("x-cron-secret") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!secret || supplied !== secret) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  const definitions = [
    ["golden-cross", "KR", "D"], ["golden-cross", "US", "D"],
    ["bollinger", "KR", "D:LOWER_OR_BELOW"], ["bollinger", "KR", "D:MIDDLE_TO_LOWER"],
    ["bollinger", "US", "D:LOWER_OR_BELOW"], ["bollinger", "US", "D:MIDDLE_TO_LOWER"],
  ] as const;
  const caches = await Promise.all(definitions.map(async ([kind, scope, suffix]) => {
    const key = kind === "golden-cross" ? `daily-golden-cross:${scope}:D` : `daily-bollinger:${scope}:${suffix}`;
    const data = await readKisCache<CachedGoldenCross>(key);
    const qualified = data?.qualified ?? [];
    const excluded = scope === "KR" ? qualified.filter((item) => excludedKrName.test(item.name ?? "")) : [];
    return {
      kind,
      scope,
      key,
      exists: Boolean(data),
      updatedAt: data?.updatedAt ?? null,
      timeframe: data?.timeframe ?? null,
      scannedCount: data?.scannedCount ?? 0,
      qualifiedCount: data?.qualifiedCount ?? qualified.length,
      excludedProductNameCount: excluded.length,
      excludedProductNameSamples: excluded.slice(0, 5).map(({ market, code, name }) => ({ market, code, name })),
      sample: (data?.qualified ?? []).slice(0, 5).map(({ market, code, name, reason }) => ({ market, code, name, reason })),
    };
  }));
  return NextResponse.json({ ok: true, checkedAt: new Date().toISOString(), caches });
}
