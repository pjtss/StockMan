import crypto from "node:crypto";
import { loadStoredKrInstrumentScopes } from "@/lib/kr-instruments";
import { refreshKrDailyCandles } from "@/lib/kr-daily-price-cache";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { recordCandleCacheFailure } from "@/lib/candle-cache-failure-history";
import { loadDueCandleCacheRetries, markCandleCacheRetrySuccess } from "@/lib/candle-cache-retry";
import { refreshDailyBollingerCaches } from "@/lib/daily-cache-followup";

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
  dueTimeframes?: Array<"D" | "W" | "M">;
  progress?: { elapsedMs: number; etaMs: number | null; lastCode?: string };
};

const jobs = new Map<string, Job>();
const MAX_RETAINED_JOBS = 20;

function trimJobs() {
  while (jobs.size > MAX_RETAINED_JOBS) jobs.delete(jobs.keys().next().value as string);
}

async function run(job: Job) {
  job.status = "PROCESSING";
  const progressStartedAt = Date.now();
  try {
    const { scopes } = await loadStoredKrInstrumentScopes();
    job.instrumentCount = scopes.length;
    const nowMs = Date.now();
    // The current-day candle is partial during market hours, so refresh it
    // frequently while keeping weekly/monthly traffic bounded.
    const freshness = { D: 60 * 60 * 1000, W: 3 * 24 * 60 * 60 * 1000, M: 7 * 24 * 60 * 60 * 1000 } as const;
    const fetched = await getDb().execute(sql`SELECT timeframe, MAX(fetched_at) AS fetched_at FROM kr_instrument_universe_candles GROUP BY timeframe`);
    const latestByTimeframe = new Map(fetched.rows.map((row: any) => [String(row.timeframe), row.fetched_at ? new Date(row.fetched_at).getTime() : 0]));
    const dueTimeframes = (Object.keys(freshness) as Array<keyof typeof freshness>).filter((timeframe) => !latestByTimeframe.get(timeframe) || nowMs - Number(latestByTimeframe.get(timeframe)) >= freshness[timeframe]);
    const retryRows = await loadDueCandleCacheRetries();
    const retryKeys = new Set(retryRows.map((row) => `${row.market.toUpperCase()}:${row.code.toUpperCase()}:${row.timeframe}`));
    for (const row of retryRows) if (!dueTimeframes.includes(row.timeframe)) dueTimeframes.push(row.timeframe);
    job.dueTimeframes = dueTimeframes;
    let cursor = 0;
    const worker = async () => {
      while (true) {
        const item = scopes[cursor++];
        if (!item) return;
        try {
          const [daily, weekly, monthly] = await Promise.all([dueTimeframes.includes("D") ? refreshKrDailyCandles(item.code, "D", item.market) : null, dueTimeframes.includes("W") ? refreshKrDailyCandles(item.code, "W", item.market) : null, dueTimeframes.includes("M") ? refreshKrDailyCandles(item.code, "M", item.market) : null]);
          const result = { market: item.market, code: item.code, daily: daily?.diagnostics ?? null, weekly: weekly?.diagnostics ?? null, monthly: monthly?.diagnostics ?? null };
          job.results.push(result);
          const key = `${item.market.toUpperCase()}:${item.code.toUpperCase()}`;
          const success = (!dueTimeframes.includes("D") || Number(result.daily?.parsedCandleCount ?? 0) > 0) && (!dueTimeframes.includes("W") || Number(result.weekly?.parsedCandleCount ?? 0) > 0) && (!dueTimeframes.includes("M") || Number(result.monthly?.parsedCandleCount ?? 0) > 0);
          for (const timeframe of dueTimeframes) { const diagnostic = timeframe === "D" ? result.daily : timeframe === "W" ? result.weekly : result.monthly; if (Number(diagnostic?.parsedCandleCount ?? 0) > 0 && (retryKeys.has(`${key}:${timeframe}`) || retryRows.length > 0)) await markCandleCacheRetrySuccess({ market: item.market, code: item.code, timeframe }); }
          if (success) job.successCount += 1;
          else {
            job.failureCount += 1;
            for (const timeframe of dueTimeframes) {
              const diagnostic = timeframe === "D" ? result.daily : timeframe === "W" ? result.weekly : result.monthly;
              if (Number(diagnostic?.parsedCandleCount ?? 0) <= 0) await recordCandleCacheFailure({ market: item.market, code: item.code, timeframe, error: `${timeframe}: ${diagnostic?.msg1 ?? "KIS returned no candles"}` });
            }
          }
        } catch (error) {
          job.failureCount += 1;
          const message = error instanceof Error ? error.message : String(error);
          job.results.push({ market: item.market, code: item.code, error: message });
          for (const timeframe of dueTimeframes) await recordCandleCacheFailure({ market: item.market, code: item.code, timeframe, error: message });
        } finally {
          job.processedCount += 1;
          const elapsedMs = Date.now() - progressStartedAt;
          job.progress = { elapsedMs, etaMs: job.processedCount ? Math.round(elapsedMs / job.processedCount * (job.instrumentCount - job.processedCount)) : null, lastCode: item.code };
        }
      }
    };
    // Each worker performs daily, weekly, monthly and quote requests. Keep
    // the fan-out below KIS per-second limits instead of creating bursts.
    await Promise.all(Array.from({ length: Math.min(2, Math.max(1, scopes.length)) }, worker));
    job.status = "COMPLETED";
    (job as any).bollingerCache = job.failureCount === 0 ? await refreshDailyBollingerCaches("KR") : { skipped: true, reason: "daily_candle_failures", failureCount: job.failureCount };
  } catch (error) {
    job.status = "FAILED";
    job.error = error instanceof Error ? error.message : String(error);
  } finally {
    job.completedAt = new Date().toISOString();
  }
}

export function startKrDailyCacheJob() {
  const job = createJob();
  jobs.set(job.jobId, job);
  trimJobs();
  void run(job);
  return job;
}

function createJob(): Job {
  return { jobId: crypto.randomUUID(), status: "QUEUED", startedAt: new Date().toISOString(), instrumentCount: 0, processedCount: 0, successCount: 0, failureCount: 0, results: [] };
}

/** Synchronous application-service entry point used by OCI cron. */
export async function runKrDailyCacheNow() {
  const job = createJob();
  jobs.set(job.jobId, job);
  trimJobs();
  await run(job);
  return job;
}

export function getKrDailyCacheJob(jobId: string) {
  return jobs.get(jobId) ?? null;
}
