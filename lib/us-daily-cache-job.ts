import crypto from "node:crypto";
import { warmUsDailyPriceCache } from "@/lib/us-daily-price-cache-warm";

type JobStatus = "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED";
type Job = {
  jobId: string;
  status: JobStatus;
  startedAt: string;
  completedAt?: string;
  result?: Awaited<ReturnType<typeof warmUsDailyPriceCache>>;
  error?: string;
};

const jobs = new Map<string, Job>();
const MAX_RETAINED_JOBS = 20;

function trimJobs() {
  while (jobs.size > MAX_RETAINED_JOBS) jobs.delete(jobs.keys().next().value as string);
}

async function run(job: Job) {
  job.status = "PROCESSING";
  try {
    job.result = await warmUsDailyPriceCache();
    job.status = "COMPLETED";
  } catch (error) {
    job.status = "FAILED";
    job.error = error instanceof Error ? error.message : String(error);
  } finally {
    job.completedAt = new Date().toISOString();
  }
}

export function startUsDailyCacheJob() {
  const job: Job = { jobId: crypto.randomUUID(), status: "QUEUED", startedAt: new Date().toISOString() };
  jobs.set(job.jobId, job);
  trimJobs();
  void run(job);
  return job;
}

export function getUsDailyCacheJob(jobId: string) {
  return jobs.get(jobId) ?? null;
}
