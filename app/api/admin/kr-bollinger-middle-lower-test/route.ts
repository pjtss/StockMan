import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { scanStoredKrBollingerBands, type KrBollingerPolicy } from "@/lib/kr-bollinger-band";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await requireAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const number = (key: string) => { const value = Number(params.get(key)); return Number.isFinite(value) ? value : undefined; };
  const policy: Partial<KrBollingerPolicy> = { timeframe: params.get("timeframe") === "W" || params.get("timeframe") === "M" ? params.get("timeframe") as "W" | "M" : "D", period: number("period"), stdDevMultiplier: number("stdDevMultiplier"), minPrice: number("minPrice"), minVolume: number("minVolume"), minTurnoverRatio: number("minTurnoverRatio"), zone: "MIDDLE_TO_LOWER" };
  Object.keys(policy).forEach((key) => { if (policy[key as keyof KrBollingerPolicy] === undefined) delete policy[key as keyof KrBollingerPolicy]; });
  try { return NextResponse.json({ mode: "ADMIN_MANUAL_TEST", ...(await scanStoredKrBollingerBands({ moduleKey: "kr-bollinger-middle-lower", policy })) }); }
  catch (error) { return NextResponse.json({ ok: false, mode: "ADMIN_MANUAL_TEST", error: error instanceof Error ? error.message : String(error) }, { status: 502 }); }
}
