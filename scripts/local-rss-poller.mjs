import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { loadLocalEnv } from "./local-env.mjs";
import { DEFAULT_ORIGINAL_RSS_FEEDS, fetchOriginalRssFeed } from "../lib/local-rss-watch/feed-source.mjs";
import { rateLimitCooldownMs } from "../lib/local-rss-watch/retry-policy.mjs";
import { validateCodexAnalysis } from "../lib/local-rss-watch/analysis-contract.mjs";
import { createLocalRssWatchStore } from "../lib/local-rss-watch/local-store.mjs";
import { DEFAULT_ANALYSIS_INBOX_DIR, drainCodexAnalysisInbox, enqueueCodexAnalysis, waitForCodexAnalysisConsumption } from "../lib/local-rss-watch/analysis-inbox.mjs";
import { queueCurrentFeedBackfill } from "../lib/local-rss-watch/current-feed-backfill.mjs";

export const DEFAULT_INTERVAL_MS = 10_000;
export const DEFAULT_FEEDS = DEFAULT_ORIGINAL_RSS_FEEDS;
export function createLocalRssPoller({
  feeds = DEFAULT_FEEDS,
  outputDir = join(process.env.USERPROFILE || homedir(), "Downloads"),
  analysisInboxDir = DEFAULT_ANALYSIS_INBOX_DIR,
  fetchImpl = fetch,
  now = () => new Date(),
  log = () => {},
} = {}) {
  const store = createLocalRssWatchStore({ outputDir });
  const sourceRetryAt = new Map();

  async function pollOnce() {
    const summaries = [];
    const failedSources = [];
    const deferredSources = [];
    const errors = [];
    let newCount = 0;
    const fetchedFeeds = await Promise.all(feeds.map(async (feed) => {
      const nowMs = Date.parse(now().toISOString());
      const retryAt = sourceRetryAt.get(feed.source) || 0;
      if (retryAt > nowMs) return { feed, deferredMs: retryAt - nowMs };
      try {
        return { feed, parsed: await fetchOriginalRssFeed(feed, { fetchImpl }) };
      } catch (error) {
        return { feed, error };
      }
    }));

    // Fetch providers concurrently to keep a cycle within the longest source timeout;
    // persist each result serially because both sources share the same local files.
    for (const { feed, parsed, error, deferredMs } of fetchedFeeds) {
      if (deferredMs) {
        deferredSources.push({ source: feed.source, retryInMs: deferredMs });
        continue;
      }
      if (error) {
        failedSources.push(feed.source);
        const message = error instanceof Error ? error.message : "알 수 없는 오류";
        errors.push({ source: feed.source, message });
        const cooldownMs = rateLimitCooldownMs(error?.status, error?.retryAfter, Date.parse(now().toISOString()));
        if (cooldownMs > 0) {
          sourceRetryAt.set(feed.source, Date.parse(now().toISOString()) + cooldownMs);
          log(`[${feed.source}] HTTP 429 · ${cooldownMs}ms 동안 해당 출처 요청만 보류합니다.`);
        }
        log(`[${feed.source}] 조회 실패: ${message}`);
        continue;
      }
      sourceRetryAt.delete(feed.source);
      try {
        const result = store.ingestFeed(feed.source, parsed.items, now().toISOString());
        newCount += result.newItems;
        summaries.push(result);
      } catch (error) {
        failedSources.push(feed.source);
        const message = error instanceof Error ? error.message : "알 수 없는 오류";
        errors.push({ source: feed.source, message });
        log(`[${feed.source}] 조회 실패: ${message}`);
      }
    }
    const handoff = drainCodexAnalysisInbox({
      directory: analysisInboxDir,
      recordAnalysis: (itemId, result) => store.recordAnalysis(itemId, validateCodexAnalysis(result)),
      log,
    });
    return {
      ok: failedSources.length < feeds.length,
      csvPath: store.csvPath,
      statePath: store.statePath,
      newCount,
      failedSources,
      errors,
      deferredSources,
      feeds: summaries,
      analysisHandoff: handoff,
    };
  }

  function backfillCurrent() {
    return queueCurrentFeedBackfill({
      feeds,
      fetchFeed: (feed) => fetchOriginalRssFeed(feed, { fetchImpl }),
      store,
      now,
    });
  }

  function recordAnalysis(id, rawResult) {
    return store.recordAnalysis(id, validateCodexAnalysis(rawResult));
  }

  return {
    csvPath: store.csvPath,
    statePath: store.statePath,
    pollOnce,
    backfillCurrent,
    recordAnalysis,
    pending: store.pending,
  };
}

function parseArgs(args) {
  const options = { once: false, backfillCurrent: false, intervalMs: DEFAULT_INTERVAL_MS, recordId: "", result: "", pending: false, pendingLimit: 20 };
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--once") options.once = true;
    else if (args[i] === "--backfill-current") options.backfillCurrent = true;
    else if (args[i] === "--interval-ms") options.intervalMs = Number(args[++i]);
    else if (args[i] === "--output-dir") options.outputDir = args[++i];
    else if (args[i] === "--record-id") options.recordId = args[++i];
    else if (args[i] === "--result-base64") options.result = args[++i];
    else if (args[i] === "--pending") { options.pending = true; if (/^\d+$/.test(args[i + 1] || "")) options.pendingLimit = Number(args[++i]); }
    else if (args[i] === "--help") options.help = true;
    else throw new Error(`알 수 없는 인자: ${args[i]}`);
  }
  if (!Number.isSafeInteger(options.intervalMs) || options.intervalMs < 5_000 || options.intervalMs > 3_600_000) throw new Error("--interval-ms는 5000~3600000 범위여야 합니다.");
  if (options.backfillCurrent && (options.once || options.pending || options.recordId)) throw new Error("--backfill-current는 --once, --pending, --record-id와 함께 사용할 수 없습니다.");
  return options;
}

export async function runPollerCli(args = process.argv.slice(2)) {
  const options = parseArgs(args);
  if (options.help) return { usage: "npm run rss:watch -- [--once | --backfill-current | --pending [limit]] [--interval-ms 10000] [--output-dir <path>] | --record-id <item_id> --result-base64 <UTF-8 JSON base64>", note: "10초마다 StockTitan·SEC EDGAR 8-K RSS를 직접 조회합니다. 최초 기준선 이전 항목은 기본 제외하며, --backfill-current를 명시하면 현재 각 피드 항목을 INITIAL_BACKFILL로 구분해 Downloads CSV 분석 대기열에 추가합니다." };
  loadLocalEnv({ override: true });
  const watcher = createLocalRssPoller({ outputDir: options.outputDir, log: (message) => console.error(message) });
  if (options.backfillCurrent) return watcher.backfillCurrent();
  if (options.pending) return { csvPath: watcher.csvPath, count: watcher.pending(options.pendingLimit).length, items: watcher.pending(options.pendingLimit) };
  if (options.recordId) {
    if (!options.result) throw new Error("--record-id와 함께 --result-base64가 필요합니다.");
    const result = JSON.parse(Buffer.from(options.result, "base64").toString("utf8"));
    const queued = enqueueCodexAnalysis({ itemId: options.recordId, result: validateCodexAnalysis(result) });
    const applied = await waitForCodexAnalysisConsumption({ itemId: options.recordId });
    return { ...queued, applied };
  }
  if (options.once) return watcher.pollOnce();
  let stopping = false;
  const stop = () => { stopping = true; };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  while (!stopping) {
    const startedAt = Date.now();
    const result = await watcher.pollOnce();
    console.log(JSON.stringify({ at: new Date().toISOString(), ...result }));
    await new Promise((resolveDelay) => setTimeout(resolveDelay, Math.max(0, options.intervalMs - (Date.now() - startedAt))));
  }
  return { stopped: true, csvPath: watcher.csvPath };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runPollerCli().then((result) => {
    if (result) console.log(JSON.stringify(result, null, 2));
    if (result?.ok === false) process.exitCode = 1;
  })
    .catch((error) => { console.error(`[rss:watch] ${error instanceof Error ? error.message : "실패"}`); process.exitCode = 1; });
}
