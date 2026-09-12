import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { intradayMemoryState } from "@/lib/intraday-memory-state";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await requireAdminSession())) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const state = intradayMemoryState.snapshot();
  return NextResponse.json({ ok: true, generatedAt: new Date().toISOString(), flow: { snapshot: { currentCount: state.current.length, previousCount: state.previous.length }, filters: { managedCandidates: state.candidates.length, ratioEligible: state.candidates.filter((candidate) => candidate.priority > 0).length }, queue: { dueCount: intradayMemoryState.dueCandidates().length, inflightCount: state.inflightCount } }, state });
}
