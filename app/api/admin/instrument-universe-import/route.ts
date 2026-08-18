import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { importInstrumentMasters } from "@/lib/instrument-universe-import";

export async function POST(request: Request) {
  try {
    await requireAdminSession();
    const body = await request.json().catch(() => ({}));
    const sourceDirectory = String(body.sourceDirectory || process.env.INSTRUMENT_MASTER_DIR || "").trim();
    if (!sourceDirectory) return NextResponse.json({ ok: false, error: "sourceDirectory 또는 INSTRUMENT_MASTER_DIR가 필요합니다." }, { status: 400 });
    return NextResponse.json(await importInstrumentMasters(sourceDirectory));
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export const GET = POST;
