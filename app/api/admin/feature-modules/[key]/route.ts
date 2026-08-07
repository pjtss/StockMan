import { NextResponse } from "next/server";
import { loadFeatureModuleSettings, saveFeatureModuleSettings } from "@/lib/feature-module-settings";
import { getFeatureModule, type FeatureModuleKey } from "@/lib/feature-modules";
import { requireAdminSession } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ key: string }> }) {
  if (!(await requireAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { key } = await context.params;
  if (!getFeatureModule(key)) return NextResponse.json({ error: "기능 모듈을 찾을 수 없습니다." }, { status: 404 });
  return NextResponse.json(await loadFeatureModuleSettings(key as FeatureModuleKey));
}

export async function PATCH(request: Request, context: { params: Promise<{ key: string }> }) {
  if (!(await requireAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { key } = await context.params;
    const body = await request.json();
    const settings = await saveFeatureModuleSettings(key as FeatureModuleKey, {
      enabled: Boolean(body.enabled), startTime: String(body.startTime || ""), endTime: String(body.endTime || ""), cooldownSeconds: Number(body.cooldownSeconds), activeDays: Array.isArray(body.activeDays) ? body.activeDays.map(Number) : [1, 2, 3, 4, 5], featureSettings: body.featureSettings,
    });
    return NextResponse.json(settings);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "저장에 실패했습니다." }, { status: 400 });
  }
}
