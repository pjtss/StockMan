export type ShortInterestMetric = {
  ticker: string;
  shortVolume: number | null;
  totalVolume: number | null;
  shortVolumeRatio: number | null;
  shortInterest: number | null;
  daysToCover: number | null;
  asOf: string | null;
  source: "FINRA" | "NASDAQ" | "SEC";
  status: "OK" | "ZERO_SHORT_VOLUME" | "NO_RECORD" | "NULL_FIELD" | "API_ERROR" | "NOT_PUBLISHED" | "STALE";
  reason?: string;
};

export type ShortInterestSnapshot = ShortInterestMetric & { fetchedAt: Date };
