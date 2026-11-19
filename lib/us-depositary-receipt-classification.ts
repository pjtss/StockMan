export const DEPOSITARY_RECEIPT_DESCRIPTOR_PATTERN = /\b(?:ADR|ADS)\b|\b(?:DEPOSITARY|DEPOSITORY)\s+(?:SHARES?|RECEIPTS?)\b/i;

// KIS's isdr flag can be N for listings whose official English instrument
// description explicitly says ADR/ADS. Keep public daily-candle eligibility
// aligned with the importer using the same exact descriptor classes.
const DEPOSITARY_RECEIPT_SQL_PATTERN = "'(^|[^A-Za-z0-9])(ADR|ADS)([^A-Za-z0-9]|$)|(^|[^A-Za-z0-9])(DEPOSITARY|DEPOSITORY)[[:space:]]+(SHARES?|RECEIPTS?)([^A-Za-z0-9]|$)'";

export const US_MASTER_NOT_DEPOSITARY_RECEIPT_SQL = `COALESCE(u.english_name, '') !~* ${DEPOSITARY_RECEIPT_SQL_PATTERN} AND COALESCE(u.name, '') !~* ${DEPOSITARY_RECEIPT_SQL_PATTERN}`;

export function hasDepositaryReceiptDescriptor(value: string | null | undefined) {
  return DEPOSITARY_RECEIPT_DESCRIPTOR_PATTERN.test(value ?? "");
}
