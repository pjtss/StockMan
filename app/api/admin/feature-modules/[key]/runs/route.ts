import { NextResponse } from "next/server";
import { getFeatureModule, type FeatureModuleKey } from "@/lib/feature-modules";
import { loadRecentAutomationRuns } from "@/lib/automation-run-repository";
import { requireAdminSession } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ key: string }> }) {
  if (!(await requireAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { key } = await context.params;
  if (!getFeatureModule(key)) return NextResponse.json({ error: "기능 모듈을 찾을 수 없습니다." }, { status: 404 });
  try {
    return NextResponse.json({ runs: await loadRecentAutomationRuns(key as FeatureModuleKey) });
  } catch (error) {
    console.error("[API /admin/feature-modules/runs] Error:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ ok: false, error: "FEATURE_MODULE_RUNS_UNAVAILABLE" }, { status: 503 });
  }
}
