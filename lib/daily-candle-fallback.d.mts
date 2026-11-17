export interface DailyCandleItem<TCandle = unknown> {
  code: string;
  candles: TCandle[];
  source?: string;
}

export interface DailyCandleFallbackResult<TCandle = unknown> {
  items: DailyCandleItem<TCandle>[];
  requestedFallbackCount: number;
  failedCodes: string[];
}

export function fillMissingDailyCandleItems<TCandle = unknown>(options: {
  codes: string[];
  items: Array<{ code: string; candles?: TCandle[] | null; source?: string }>;
  concurrency: number;
  targetDate?: string;
  fetchChart: (code: string) => Promise<{ candles?: TCandle[] | null } | null>;
  onFailure?: (code: string, error: unknown) => void;
}): Promise<DailyCandleFallbackResult<TCandle>>;
