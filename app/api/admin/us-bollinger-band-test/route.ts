import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { scanStoredUsBollingerBands, type UsBollingerPolicy } from "@/lib/us-bollinger-band";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await requireAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const number = (key: string) => { const value = Number(params.get(key)); return Number.isFinite(value) ? value : undefined; };
  const policy: Partial<UsBollingerPolicy> = {
    period: number("period"),
    stdDevMultiplier: number("stdDevMultiplier"),
    minPrice: number("minPrice"),
    minVolume: number("minVolume"),
    minTurnoverRatio: number("minTurnoverRatio"),
  };
  Object.keys(policy).forEach((key) => { if (policy[key as keyof UsBollingerPolicy] === undefined) delete policy[key as keyof UsBollingerPolicy]; });
  try {
    return NextResponse.json({ mode: "ADMIN_MANUAL_TEST", ...(await scanStoredUsBollingerBands({ policy })) });
  } catch (error) {
    return NextResponse.json({ ok: false, mode: "ADMIN_MANUAL_TEST", error: error instanceof Error ? error.message : String(error) }, { status: 502 });
  }
}
