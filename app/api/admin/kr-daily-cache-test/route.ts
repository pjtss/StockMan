import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { getKrDailyCacheJob, startKrDailyCacheJob } from "@/lib/kr-daily-cache-job";

export const dynamic = "force-dynamic";

export async function POST() {
  if (!(await requireAdminSession())) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const job = startKrDailyCacheJob();
  return NextResponse.json({ ok: true, mode: "ADMIN_MANUAL_REFRESH", jobId: job.jobId, status: job.status, statusEndpoint: `/api/admin/kr-daily-cache-test?jobId=${job.jobId}` }, { status: 202 });
}

export async function GET(request: Request) {
  if (!(await requireAdminSession())) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const jobId = new URL(request.url).searchParams.get("jobId");
  if (!jobId) return NextResponse.json({ ok: false, error: "jobId is required" }, { status: 400 });
  const job = getKrDailyCacheJob(jobId);
  if (!job) return NextResponse.json({ ok: false, error: "job not found", jobId }, { status: 404 });
  return NextResponse.json({ ok: true, ...job, progress: job.instrumentCount ? Number((job.processedCount / job.instrumentCount * 100).toFixed(1)) : 0 });
}
