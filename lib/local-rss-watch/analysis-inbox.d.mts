export const DEFAULT_ANALYSIS_INBOX_DIR: string;
export function enqueueCodexAnalysis(input: { itemId: string; result: Record<string, unknown>; directory?: string }): { queued: boolean; alreadyQueued?: boolean; itemId: string; inboxPath: string };
export function drainCodexAnalysisInbox(options: { recordAnalysis: (itemId: string, result: Record<string, unknown>) => unknown; directory?: string; log?: (message: string) => void }): { applied: number; failed: number; errors: Array<{ file: string; message: string }> };
export function waitForCodexAnalysisConsumption(options: { itemId: string; directory?: string; timeoutMs?: number; intervalMs?: number }): Promise<boolean>;
