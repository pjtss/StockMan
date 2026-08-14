import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { scanStoredUsBollingerBands, type UsBollingerPolicy } from "@/lib/us-bollinger-band";
import { getBollingerBandTestJob, startBollingerBandTestJob } from "@/lib/bollinger-band-test-job";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  if (!(await requireAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const job = startBollingerBandTestJob("us");
  return NextResponse.json({ ok: true, jobId: job.jobId, status: job.status, statusEndpoint: `/api/admin/us-bollinger-band-test?jobId=${encodeURIComponent(job.jobId)}` }, { status: 202 });
}

export async function GET(request: Request) {
  if (!(await requireAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const jobId = params.get("jobId");
  if (jobId) {
    const job = getBollingerBandTestJob(jobId);
    return job ? NextResponse.json(job) : NextResponse.json({ ok: false, error: "JOB_NOT_FOUND" }, { status: 404 });
  }
  const number = (key: string) => { const value = Number(params.get(key)); return Number.isFinite(value) ? value : undefined; };
  const policy: Partial<UsBollingerPolicy> = {
    timeframe: params.get("timeframe") === "W" || params.get("timeframe") === "M" ? params.get("timeframe") as "W" | "M" : "D",
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
