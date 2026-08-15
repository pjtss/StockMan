import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { analyzeUsShortSqueeze } from "@/lib/us-short-squeeze-analysis";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { if (!(await requireAdminSession())) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 }); const ticker = new URL(request.url).searchParams.get("ticker") || ""; if (!ticker) return NextResponse.json({ ok: false, error: "티커를 입력하세요." }, { status: 400 }); try { return NextResponse.json({ mode: "ADMIN_MANUAL_TEST", checkedAt: new Date().toISOString(), ...(await analyzeUsShortSqueeze(ticker)) }); } catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 502 }); } }
