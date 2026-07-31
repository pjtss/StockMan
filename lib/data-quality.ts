export const DATA_QUALITY_STATUS = {
  OK: "OK",
  API_FAILED: "API_FAILED",
  DETAIL_FAILED: "DETAIL_FAILED",
  MARKET_CAP_MISSING: "MARKET_CAP_MISSING",
  TRADING_VALUE_MISSING: "TRADING_VALUE_MISSING",
  STALE: "STALE",
  DUPLICATE: "DUPLICATE",
  PREVIOUS_SNAPSHOT_MISSING: "PREVIOUS_SNAPSHOT_MISSING",
} as const;

export type DataQualityStatus = typeof DATA_QUALITY_STATUS[keyof typeof DATA_QUALITY_STATUS];

export function isUsableDataQualityStatus(status: string | null | undefined) {
  return status === DATA_QUALITY_STATUS.OK;
}
