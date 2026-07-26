import { NextResponse } from "next/server";
import { loadFeatureModuleSettings, saveFeatureModuleSettings } from "@/lib/feature-module-settings";
import { getFeatureModule, type FeatureModuleKey } from "@/lib/feature-modules";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ key: string }> }) {
  const { key } = await context.params;
  if (!getFeatureModule(key)) return NextResponse.json({ error: "기능 모듈을 찾을 수 없습니다." }, { status: 404 });
  return NextResponse.json(await loadFeatureModuleSettings(key as FeatureModuleKey));
}

export async function PATCH(request: Request, context: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await context.params;
    const body = await request.json();
    const settings = await saveFeatureModuleSettings(key as FeatureModuleKey, {
      enabled: Boolean(body.enabled), startTime: String(body.startTime || ""), endTime: String(body.endTime || ""), cooldownSeconds: Number(body.cooldownSeconds), featureSettings: body.featureSettings,
    });
    return NextResponse.json(settings);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "저장에 실패했습니다." }, { status: 400 });
  }
}
