export function queueCurrentFeedBackfill(options: {
  feeds: Array<{ source: string; url: string }>;
  fetchFeed: (feed: { source: string; url: string }) => Promise<{ items: Array<Record<string, unknown>> }>;
  store: {
    csvPath: string;
    statePath: string;
    queueInitialBackfill(source: string, items: Array<Record<string, unknown>>, observedAt: string): { source: string; feedItems: number; acceptedItems: number; newItems: number; backfill: true };
  };
  now?: () => Date;
}): Promise<{
  ok: boolean;
  csvPath: string;
  statePath: string;
  backfill: true;
  newCount: number;
  failedSources: string[];
  errors: Array<{ source: string; message: string }>;
  feeds: Array<{ source: string; feedItems: number; acceptedItems: number; newItems: number; backfill: true }>;
}>;
