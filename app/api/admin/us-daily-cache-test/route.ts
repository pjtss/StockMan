import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { warmUsDailyPriceCache } from "@/lib/us-daily-price-cache-warm";
import { getUsDailyCacheJob, startUsDailyCacheJob } from "@/lib/us-daily-cache-job";

export const dynamic = "force-dynamic";

export async function POST() {
  if (!(await requireAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const job = startUsDailyCacheJob();
  return NextResponse.json({ ok: true, mode: "ADMIN_MANUAL_REFRESH", jobId: job.jobId, status: job.status, statusEndpoint: `/api/admin/us-daily-cache-test?jobId=${job.jobId}` }, { status: 202 });
}

export async function GET(request: Request) {
  if (!(await requireAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const jobId = new URL(request.url).searchParams.get("jobId");
  if (jobId) {
    const job = getUsDailyCacheJob(jobId);
    if (!job) return NextResponse.json({ ok: false, error: "job not found", jobId }, { status: 404 });
    return NextResponse.json({ ok: true, ...job });
  }
  try { return NextResponse.json({ ok: true, mode: "ADMIN_MANUAL_REFRESH", ...(await warmUsDailyPriceCache()) }); }
  catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 502 }); }
}
