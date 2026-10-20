export interface DailyCandleSummaryRow {
  code: string;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export function selectLatestDailySummaryRows<T extends DailyCandleSummaryRow>(rows: T[]): T[];
