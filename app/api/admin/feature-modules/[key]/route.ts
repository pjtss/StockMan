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
    const current = await loadFeatureModuleSettings(key as FeatureModuleKey);
    const has = (field: string) => Object.prototype.hasOwnProperty.call(body, field);
    const incomingFeatureSettings = body.featureSettings;
    const featureSettings = incomingFeatureSettings === undefined
      ? current.featureSettings
      : {
        ...current.featureSettings,
        ...incomingFeatureSettings,
        discordFormat: incomingFeatureSettings.discordFormat === undefined ? current.featureSettings?.discordFormat : { ...current.featureSettings?.discordFormat, ...incomingFeatureSettings.discordFormat },
        evaluation: incomingFeatureSettings.evaluation === undefined ? current.featureSettings?.evaluation : { ...current.featureSettings?.evaluation, ...incomingFeatureSettings.evaluation },
        marketRss: incomingFeatureSettings.marketRss === undefined ? current.featureSettings?.marketRss : { ...current.featureSettings?.marketRss, ...incomingFeatureSettings.marketRss },
        secEdgar: incomingFeatureSettings.secEdgar === undefined ? current.featureSettings?.secEdgar : { ...current.featureSettings?.secEdgar, ...incomingFeatureSettings.secEdgar },
        newsLookup: incomingFeatureSettings.newsLookup === undefined ? current.featureSettings?.newsLookup : { ...current.featureSettings?.newsLookup, ...incomingFeatureSettings.newsLookup },
        minuteBollingerPolicy: incomingFeatureSettings.minuteBollingerPolicy === undefined ? current.featureSettings?.minuteBollingerPolicy : { ...current.featureSettings?.minuteBollingerPolicy, ...incomingFeatureSettings.minuteBollingerPolicy },
      };
    const settings = await saveFeatureModuleSettings(key as FeatureModuleKey, {
      enabled: has("enabled") ? Boolean(body.enabled) : current.enabled,
      startTime: has("startTime") ? String(body.startTime || "") : current.startTime,
      endTime: has("endTime") ? String(body.endTime || "") : current.endTime,
      scheduleMode: has("scheduleMode") ? (body.scheduleMode === "weekly-range" ? "weekly-range" : "daily-window") : current.scheduleMode,
      startDay: has("startDay") ? Number(body.startDay) : current.startDay,
      endDay: has("endDay") ? Number(body.endDay) : current.endDay,
      cooldownSeconds: has("cooldownSeconds") ? Number(body.cooldownSeconds) : current.cooldownSeconds,
      intervalSeconds: has("intervalSeconds") ? Number(body.intervalSeconds) : current.intervalSeconds,
      activeDays: Array.isArray(body.activeDays) ? body.activeDays.map(Number) : current.activeDays,
      featureSettings,
    });
    return NextResponse.json(settings);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "저장에 실패했습니다." }, { status: 400 });
  }
}
