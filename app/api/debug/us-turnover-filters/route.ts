import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { loadAdminFeatureFlags } from "@/lib/admin-flags";
import { loadFeatureModuleSettings } from "@/lib/feature-module-settings";
import { DEFAULT_US_TURNOVER_FILTER_SETTINGS, loadUsTurnoverFilterSettings } from "@/lib/us-turnover-settings";

export async function GET(request: Request) {
  const supplied = request.headers.get("x-cron-secret") || "";
  const cronAuthorized = Boolean(process.env.CRON_SECRET && supplied === process.env.CRON_SECRET);
  if (!cronAuthorized && !(await requireAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [settings, flags, moduleSettings] = await Promise.all([
    loadUsTurnoverFilterSettings(),
    loadAdminFeatureFlags(),
    loadFeatureModuleSettings("us-turnover-ratio"),
  ]);
  return NextResponse.json({
    ok: true,
    queriedAt: new Date().toISOString(),
    settings,
    defaults: DEFAULT_US_TURNOVER_FILTER_SETTINGS,
    source: "DB_WITH_DEFAULTS",
    module: { enabled: flags.us_turnover_ratio && moduleSettings.enabled, schedule: moduleSettings },
    candidateUniverse: { markets: ["AMS", "NAS", "NYS"], topN: 100, detailLookupBeforeFiltering: true, snapshotPersist: "all_detail_success" },
    alertLogic: {
      newOrRecovered: "first session appearance alerts immediately",
      increase: ["absoluteTradingValueIncrease", "tradingValueRVOL", "marketCapRelativeIncreaseRate", "tradeIntensity", "persistence(3m/5m)"],
      persistenceWindows: [3, 5],
    },
  });
}
