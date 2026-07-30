import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { FEATURE_MODULES, type FeatureModuleKey } from "@/lib/feature-modules";
import { loadRecentAutomationRuns } from "@/lib/automation-run-repository";

export async function GET(request: Request) {
  const supplied = request.headers.get("x-cron-secret") || "";
  const cronAuthorized = Boolean(process.env.CRON_SECRET && supplied === process.env.CRON_SECRET);
  if (!cronAuthorized && !(await requireAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limit = Math.min(50, Math.max(1, Number(new URL(request.url).searchParams.get("limit") || 10)));
  const modules = await Promise.all(FEATURE_MODULES.map(async (module) => ({
    key: module.key,
    label: module.label,
    runs: await loadRecentAutomationRuns(module.key as FeatureModuleKey, limit),
  })));
  return NextResponse.json({ ok: true, queriedAt: new Date().toISOString(), modules });
}
