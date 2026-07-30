export type ShortInterestMetric = {
  ticker: string;
  shortVolume: number | null;
  totalVolume: number | null;
  shortVolumeRatio: number | null;
  shortInterest: number | null;
  daysToCover: number | null;
  asOf: string | null;
  shortVolumeAsOf?: string | null;
  shortInterestAsOf?: string | null;
  source: "FINRA" | "NASDAQ" | "SEC";
  status: "OK" | "ZERO_SHORT_VOLUME" | "NO_RECORD" | "NULL_FIELD" | "API_ERROR" | "NOT_PUBLISHED" | "STALE";
  reason?: string;
  previousShortInterest?: number | null;
  shortInterestChange?: number | null;
  shortInterestChangePercent?: number | null;
  averageDailyVolume?: number | null;
  thresholdListed?: boolean | null;
  thresholdAsOf?: string | null;
};

export type ShortInterestSnapshot = ShortInterestMetric & { fetchedAt: Date };
