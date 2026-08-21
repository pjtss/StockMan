import crypto from "node:crypto";
import { scanStoredKrBollingerBands } from "@/lib/kr-bollinger-band";
import { scanStoredUsBollingerBands } from "@/lib/us-bollinger-band";
import { persistDailyBollingerResults } from "@/lib/daily-bollinger-cache";

type BollingerKind = "us" | "kr";
type Job = { jobId: string; kind: BollingerKind; status: "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED"; startedAt: string; completedAt?: string; result?: unknown; error?: string };
const jobs = new Map<string, Job>();

export function startBollingerBandTestJob(kind: BollingerKind) {
  const job: Job = { jobId: crypto.randomUUID(), kind, status: "QUEUED", startedAt: new Date().toISOString() };
  jobs.set(job.jobId, job);
  void (async () => {
    job.status = "PROCESSING";
    try {
      const scan = kind === "us" ? await scanStoredUsBollingerBands() : await scanStoredKrBollingerBands();
      const cache = await persistDailyBollingerResults(kind === "us" ? "US" : "KR", scan.policy.zone ?? "LOWER_OR_BELOW", scan);
      job.result = { ...scan, cache, notification: { skipped: true, reason: "ADMIN_DEBUG_NO_DISCORD" } };
      job.status = "COMPLETED";
    } catch (error) {
      job.status = "FAILED";
      job.error = error instanceof Error ? error.message : String(error);
    } finally {
      job.completedAt = new Date().toISOString();
    }
  })();
  return job;
}

export function getBollingerBandTestJob(jobId: string) {
  return jobs.get(jobId) ?? null;
}
