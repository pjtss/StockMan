export interface DailyCacheMarketResult {
  universe: number;
  fetched: number;
  saved: number;
  failed: number;
}

export function isDailyCacheWriteVerified(expectedRows: number, verifiedRows: number): boolean;

export function isDailyCacheSyncSuccessful(
  markets: Record<string, DailyCacheMarketResult>,
  fallbackFailed: number,
): boolean;
