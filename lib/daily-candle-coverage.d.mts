export interface DailyCandleCoverageRow {
  market: string;
  requestedInstruments: number;
  persistedInstruments: number;
  missingInstruments: number;
  marketLatestCandleDate: string | null;
  instrumentsAtMarketLatest: number;
  laggingInstruments: number;
  laggingSample: Array<{ code: string; latestCandleDate: string }>;
}

export function summarizeDailyCandleCoverage(
  universeRows: Array<{ market: string; code: string }>,
  persistedParts: Array<{ market: string; candles: Array<{ code: string; candles: Array<{ date: string }> }> }>,
  sampleLimit?: number,
): DailyCandleCoverageRow[];
