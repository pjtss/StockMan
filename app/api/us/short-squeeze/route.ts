import { NextResponse } from "next/server";
import { analyzeUsShortSqueeze } from "@/lib/us-short-squeeze-analysis";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { const ticker = new URL(request.url).searchParams.get("ticker") || ""; if (!ticker) return NextResponse.json({ ok: false, error: "ticker is required" }, { status: 400 }); try { return NextResponse.json(await analyzeUsShortSqueeze(ticker)); } catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 502 }); } }
