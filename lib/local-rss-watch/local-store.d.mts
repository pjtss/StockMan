export const CSV_COLUMNS: string[];
export function csvCell(value: unknown): string;
export function renderCsv(rows: Array<Record<string, unknown>>): string;
export function parseCsvLine(line: string): string[];
export function rssItemId(source: string, item: Record<string, unknown>): string;
export function createLocalRssWatchStore(options: { outputDir: string; filename?: string }): {
  csvPath: string;
  statePath: string;
  ingestFeed(source: string, items: Array<Record<string, unknown>>, observedAt: string): { source: string; feedItems: number; newItems: number; baseline: boolean };
  queueInitialBackfill(source: string, items: Array<Record<string, unknown>>, observedAt: string): { source: string; feedItems: number; acceptedItems: number; newItems: number; backfill: true };
  pending(limit?: number): Array<Record<string, string>>;
  recordAnalysis(itemId: string, result: Record<string, unknown>): { csvPath: string; itemId: string; decision: string; alreadyRecorded?: boolean };
};
