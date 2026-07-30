export type ShortInterestMetric = {
  ticker: string;
  shortVolume: number | null;
  totalVolume: number | null;
  shortVolumeRatio: number | null;
  shortInterest: number | null;
  daysToCover: number | null;
  asOf: string | null;
  source: "FINRA" | "NASDAQ" | "SEC";
  status: "OK" | "UNAVAILABLE" | "STALE";
};

export type ShortInterestSnapshot = ShortInterestMetric & { fetchedAt: Date };
