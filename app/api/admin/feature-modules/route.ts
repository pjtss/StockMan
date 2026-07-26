import { NextResponse } from "next/server";
import { FEATURE_MODULES } from "@/lib/feature-modules";
import { loadFeatureModuleSettings } from "@/lib/feature-module-settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const modules = await Promise.all(FEATURE_MODULES.map(async (module) => ({ ...module, settings: await loadFeatureModuleSettings(module.key) })));
  return NextResponse.json({ modules });
}
