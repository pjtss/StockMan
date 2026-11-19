export const DEPOSITARY_RECEIPT_DESCRIPTOR_PATTERN = /\b(?:ADR|ADS)\b|\b(?:DEPOSITARY|DEPOSITORY)\s+(?:SHARES?|RECEIPTS?)\b/i;

// KIS's isdr flag can be N for listings whose official English instrument
// description explicitly says ADR/ADS. Keep public daily-candle eligibility
// aligned with the importer using the same exact descriptor classes.
export const US_MASTER_NOT_DEPOSITARY_RECEIPT_SQL = `COALESCE(u.english_name, '') !~* '(^|[^[:alnum:]])(ADR|ADS)([^[:alnum:]]|$)|(^|[^[:alnum:]])(DEPOSITARY|DEPOSITORY)[[:space:]]+(SHARES?|RECEIPTS?)([^[:alnum:]]|$)'`;

export function hasDepositaryReceiptDescriptor(value: string | null | undefined) {
  return DEPOSITARY_RECEIPT_DESCRIPTOR_PATTERN.test(value ?? "");
}
