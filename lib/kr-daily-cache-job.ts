import crypto from "node:crypto";
import { loadStoredKrInstrumentScopes, syncKrInstrumentUniverseFromKis } from "@/lib/kr-instruments";
import { refreshKrDailyCandles, refreshKrMarketSnapshot } from "@/lib/kr-daily-price-cache";

type JobStatus = "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED";
type Job = {
  jobId: string;
  status: JobStatus;
  startedAt: string;
  completedAt?: string;
  instrumentCount: number;
  processedCount: number;
  successCount: number;
  failureCount: number;
  results: any[];
  error?: string;
  universeSync?: unknown;
};

const jobs = new Map<string, Job>();
const MAX_RETAINED_JOBS = 20;

function trimJobs() {
  while (jobs.size > MAX_RETAINED_JOBS) jobs.delete(jobs.keys().next().value as string);
}

async function run(job: Job) {
  job.status = "PROCESSING";
  try {
    job.universeSync = await syncKrInstrumentUniverseFromKis();
    const { scopes } = await loadStoredKrInstrumentScopes();
    job.instrumentCount = scopes.length;
    let cursor = 0;
    const worker = async () => {
      while (true) {
        const item = scopes[cursor++];
        if (!item) return;
        try {
          const [daily, weekly, monthly, quote] = await Promise.all([refreshKrDailyCandles(item.code, "D"), refreshKrDailyCandles(item.code, "W"), refreshKrDailyCandles(item.code, "M"), refreshKrMarketSnapshot(item.code)]);
          const result = { market: item.market, code: item.code, daily: daily?.diagnostics ?? null, weekly: weekly?.diagnostics ?? null, monthly: monthly?.diagnostics ?? null, quote: quote ? { ok: quote.ok, status: quote.status, price: quote.price, volume: quote.volume, tradingValue: quote.tradingValue, marketCap: quote.marketCap, turnoverRatio: quote.turnoverRatio, error: quote.error, rawText: quote.rawText } : null };
          job.results.push(result);
          const success = Number(result.daily?.parsedCandleCount ?? 0) > 0 && Number(result.weekly?.parsedCandleCount ?? 0) > 0 && Number(result.monthly?.parsedCandleCount ?? 0) > 0 && result.quote?.ok === true;
          if (success) job.successCount += 1; else job.failureCount += 1;
        } catch (error) {
          job.failureCount += 1;
          job.results.push({ market: item.market, code: item.code, error: error instanceof Error ? error.message : String(error) });
        } finally { job.processedCount += 1; }
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, Math.max(1, scopes.length)) }, worker));
    job.status = "COMPLETED";
  } catch (error) {
    job.status = "FAILED";
    job.error = error instanceof Error ? error.message : String(error);
  } finally {
    job.completedAt = new Date().toISOString();
  }
}

export function startKrDailyCacheJob() {
  const job: Job = { jobId: crypto.randomUUID(), status: "QUEUED", startedAt: new Date().toISOString(), instrumentCount: 0, processedCount: 0, successCount: 0, failureCount: 0, results: [] };
  jobs.set(job.jobId, job);
  trimJobs();
  void run(job);
  return job;
}

export function getKrDailyCacheJob(jobId: string) {
  return jobs.get(jobId) ?? null;
}
