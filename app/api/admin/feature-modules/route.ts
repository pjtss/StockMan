import { NextResponse } from "next/server";
import { FEATURE_MODULES } from "@/lib/feature-modules";
import { loadFeatureModuleSettings } from "@/lib/feature-module-settings";
import { requireAdminSession } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await requireAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const modules = await Promise.all(FEATURE_MODULES.map(async (module) => ({ ...module, settings: await loadFeatureModuleSettings(module.key) })));
    return NextResponse.json({ modules });
  } catch (error) {
    console.error("[API /admin/feature-modules] Error:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ ok: false, error: "FEATURE_MODULES_UNAVAILABLE" }, { status: 503 });
  }
}
