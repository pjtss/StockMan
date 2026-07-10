import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { DEFAULT_KIS_API_CONFIGS, loadKisApiConfig, saveKisApiConfig, type KisApiConfigKey } from "@/lib/kis-api-config";

const allowedKeys: KisApiConfigKey[] = ["us_updown_rate", "us_volume_power", "us_turnover_trend", "us_price_detail"];

export async function GET() {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const configs = await Promise.all(
    allowedKeys.map(async (key) => [key, await loadKisApiConfig(key)] as const)
  );

  return NextResponse.json({
    configs: Object.fromEntries(configs),
    defaults: DEFAULT_KIS_API_CONFIGS,
  });
}

export async function PATCH(request: Request) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const key = String(body.key ?? "") as KisApiConfigKey;
  const config = body.config;

  if (!allowedKeys.includes(key)) {
    return NextResponse.json({ error: "Invalid config key" }, { status: 400 });
  }
  if (!config || typeof config !== "object") {
    return NextResponse.json({ error: "Invalid config payload" }, { status: 400 });
  }

  await saveKisApiConfig(key, config);
  return NextResponse.json({ success: true, config: await loadKisApiConfig(key) });
}
