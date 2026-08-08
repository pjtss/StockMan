import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { getAutomationIntervalSeconds, saveAutomationIntervalSeconds, getMfiThreshold, saveMfiThreshold } from "@/lib/automation-settings";

export async function GET() {
  if (!(await requireAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  console.warn("[Legacy API] GET /api/admin/automation-settings");
  return NextResponse.json({ intervalSeconds: await getAutomationIntervalSeconds(), mfiThreshold: await getMfiThreshold() }, { headers: { Deprecation: "true", Link: "</api/admin/feature-modules>; rel=successor-version" } });
}

export async function PATCH(request: Request) {
  if (!(await requireAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  console.warn("[Legacy API] PATCH /api/admin/automation-settings");
  const body = await request.json().catch(() => ({}));
  if (body.mfiThreshold !== undefined) {
    const threshold = Number(body.mfiThreshold);
    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) return NextResponse.json({ error: "MFI 기준은 0~100 사이여야 합니다." }, { status: 400 });
    return NextResponse.json({ mfiThreshold: await saveMfiThreshold(threshold), intervalSeconds: await getAutomationIntervalSeconds() });
  }
  const seconds = Number(body.intervalSeconds);
  if (!Number.isFinite(seconds) || seconds < 5 || seconds > 3600) return NextResponse.json({ error: "주기는 5~3600초 사이여야 합니다." }, { status: 400 });
  return NextResponse.json({ intervalSeconds: await saveAutomationIntervalSeconds(seconds) });
}
