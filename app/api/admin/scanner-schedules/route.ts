import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { loadFeatureModuleSettings, saveFeatureModuleSettings } from "@/lib/feature-module-settings";
import type { FeatureModuleKey } from "@/lib/feature-modules";

type ScannerScheduleKey = "dart" | "us_trading_intensity" | "domestic_trading_intensity" | "us_top_rising" | "us_turnover_ratio";
const DEFAULT_SCANNER_SCHEDULES: Record<ScannerScheduleKey, { startTime: string; endTime: string }> = {
  dart: { startTime: "00:00", endTime: "23:59" },
  us_trading_intensity: { startTime: "17:00", endTime: "02:00" },
  domestic_trading_intensity: { startTime: "08:00", endTime: "15:30" },
  us_top_rising: { startTime: "17:00", endTime: "02:00" },
  us_turnover_ratio: { startTime: "17:00", endTime: "02:00" },
};

const moduleByLegacyKey: Record<ScannerScheduleKey, FeatureModuleKey> = {
  dart: "dart-realtime",
  us_trading_intensity: "us-scanners",
  domestic_trading_intensity: "domestic-trade-intensity",
  us_top_rising: "us-scanners",
  us_turnover_ratio: "us-turnover-ratio",
};
const deprecatedHeaders = { Deprecation: "true", Link: "</api/admin/feature-modules>; rel=successor-version" };

export async function GET() {
  if (!(await requireAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  console.warn("[Legacy API] GET /api/admin/scanner-schedules");
  const schedules = { ...DEFAULT_SCANNER_SCHEDULES };
  await Promise.all(Object.entries(moduleByLegacyKey).map(async ([key, moduleKey]) => {
    const settings = await loadFeatureModuleSettings(moduleKey);
    schedules[key as ScannerScheduleKey] = { startTime: settings.startTime, endTime: settings.endTime };
  }));
  return NextResponse.json({ schedules, defaults: DEFAULT_SCANNER_SCHEDULES }, { headers: deprecatedHeaders });
}

export async function PATCH(request: Request) {
  if (!(await requireAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  console.warn("[Legacy API] PATCH /api/admin/scanner-schedules");
  const body = await request.json().catch(() => ({}));
  const key = String(body.key ?? "") as ScannerScheduleKey;
  const startTime = String(body.startTime ?? "");
  const endTime = String(body.endTime ?? "");
  const moduleKey = moduleByLegacyKey[key];
  if (!moduleKey) return NextResponse.json({ error: "Invalid schedule key" }, { status: 400, headers: deprecatedHeaders });
  if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) return NextResponse.json({ error: "Invalid time format" }, { status: 400, headers: deprecatedHeaders });
  if (!body.validateOnly) {
    const current = await loadFeatureModuleSettings(moduleKey);
    await saveFeatureModuleSettings(moduleKey, { ...current, startTime, endTime });
  }
  return NextResponse.json({ success: true, schedule: { startTime, endTime } }, { headers: deprecatedHeaders });
}
