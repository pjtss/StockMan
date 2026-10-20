export const DEFAULT_INTERVAL_MS: number;
export const DEFAULT_FEEDS: Array<{ source: string; url: string }>;
export function createLocalRssPoller(options?: {
  feeds?: Array<{ source: string; url: string }>;
  outputDir?: string;
  analysisInboxDir?: string;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  log?: (message: string) => void;
}): {
  csvPath: string;
  statePath: string;
  pollOnce(): Promise<{ ok: boolean; csvPath: string; statePath: string; newCount: number; failedSources: string[]; deferredSources: Array<{ source: string; retryInMs: number }>; errors: Array<{ source: string; message: string }>; feeds: Array<{ source: string; feedItems: number; newItems: number; baseline: boolean }>; analysisHandoff: { applied: number; failed: number; errors: Array<{ file: string; message: string }> } }>;
  backfillCurrent(): Promise<{ ok: boolean; csvPath: string; statePath: string; backfill: true; newCount: number; failedSources: string[]; errors: Array<{ source: string; message: string }>; feeds: Array<{ source: string; feedItems: number; acceptedItems: number; newItems: number; backfill: true }> }>;
  recordAnalysis(id: string, value: unknown): { csvPath: string; itemId: string; decision: string; alreadyRecorded?: boolean };
  pending(limit?: number): Array<Record<string, string>>;
};
export function runPollerCli(args?: string[]): Promise<unknown>;
