import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { scanUsMinuteObvAdl } from "@/lib/us-minute-obv-adl";
import { sendUsMinuteObvAdlSignals } from "@/lib/discord-us-minute-obv-adl";

export async function GET(request: Request) {
  if (!(await requireAdminSession())) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const p = new URL(request.url).searchParams;
  try {
    const result = await scanUsMinuteObvAdl({
      policy: {
        topN: p.has("topN") ? Number(p.get("topN")) : undefined,
        obvSignalPeriod: p.has("obvPeriod") ? Number(p.get("obvPeriod")) : undefined,
        adlSignalPeriod: p.has("adlPeriod") ? Number(p.get("adlPeriod")) : undefined,
        requireRisingSignals: p.has("rising") ? p.get("rising") !== "false" : undefined,
        minChangeRate: p.has("minRate") ? Number(p.get("minRate")) : undefined,
      },
    });
    const discord = p.get("send") === "true" ? await sendUsMinuteObvAdlSignals(result.qualified) : { skipped: true, reason: "send=false" };
    return NextResponse.json({ mode: "ADMIN_MANUAL_TEST", checkedAt: new Date().toISOString(), ...result, discord });
  } catch (error) {
    return NextResponse.json({ ok: false, mode: "ADMIN_MANUAL_TEST", error: error instanceof Error ? error.message : String(error) }, { status: 502 });
  }
}
