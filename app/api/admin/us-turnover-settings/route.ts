import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { DEFAULT_US_TURNOVER_FILTER_SETTINGS, loadUsTurnoverFilterSettings, saveUsTurnoverFilterSettings, type UsTurnoverFilterSettings } from "@/lib/us-turnover-settings";
export const dynamic = "force-dynamic";
const numericKeys = Object.keys(DEFAULT_US_TURNOVER_FILTER_SETTINGS) as Array<keyof UsTurnoverFilterSettings>;
export async function GET() { if (!(await requireAdminSession())) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 }); return NextResponse.json({ ok: true, settings: await loadUsTurnoverFilterSettings() }); }
export async function PATCH(request: Request) {
  if (!(await requireAdminSession())) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  try { const body = await request.json(); const current = await loadUsTurnoverFilterSettings(); const next = { ...current }; for (const key of numericKeys) if (Object.prototype.hasOwnProperty.call(body, key)) { const value = Number(body[key]); if (!Number.isFinite(value) || value < 0) return NextResponse.json({ ok: false, error: `${key}는 0 이상의 숫자여야 합니다.` }, { status: 400 }); next[key] = value; } return NextResponse.json({ ok: true, settings: await saveUsTurnoverFilterSettings(next) }); }
  catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "저장 실패" }, { status: 400 }); }
}
