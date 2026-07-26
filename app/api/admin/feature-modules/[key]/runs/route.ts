import { NextResponse } from "next/server";
import { getFeatureModule, type FeatureModuleKey } from "@/lib/feature-modules";
import { loadRecentAutomationRuns } from "@/lib/automation-run-repository";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ key: string }> }) {
  const { key } = await context.params;
  if (!getFeatureModule(key)) return NextResponse.json({ error: "기능 모듈을 찾을 수 없습니다." }, { status: 404 });
  return NextResponse.json({ runs: await loadRecentAutomationRuns(key as FeatureModuleKey) });
}
