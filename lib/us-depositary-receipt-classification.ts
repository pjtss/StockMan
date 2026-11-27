export const DEPOSITARY_RECEIPT_DESCRIPTOR_PATTERN = /\b(?:ADR|ADS)\b|\b(?:DEPOSITARY|DEPOSITORY)\s+(?:SHARES?|RECEIPTS?)\b/i;

// KIS's isdr flag can be N for listings whose official English instrument
// description explicitly says ADR/ADS. Keep public daily-candle eligibility
// aligned with the importer using the same exact descriptor classes.
const DEPOSITARY_RECEIPT_SQL_PATTERN = "'(^|[^A-Za-z0-9])(ADR|ADS)([^A-Za-z0-9]|$)|(^|[^A-Za-z0-9])(DEPOSITARY|DEPOSITORY)[[:space:]]+(SHARES?|RECEIPTS?)([^A-Za-z0-9]|$)'";

export const US_MASTER_NOT_DEPOSITARY_RECEIPT_SQL = `COALESCE(u.english_name, '') !~* ${DEPOSITARY_RECEIPT_SQL_PATTERN} AND COALESCE(u.name, '') !~* ${DEPOSITARY_RECEIPT_SQL_PATTERN}`;

// Most universe names cannot match the descriptor expression. Keep the exact
// expression authoritative, but only evaluate it when a cheap lowercase gate
// finds one of the ASCII descriptor tokens it necessarily contains.
function fastDepositaryReceiptCheckSql(column: "english_name" | "name") {
  return `CASE WHEN lower(COALESCE(u.${column}, '')) ~ '(adr|ads|deposit)' THEN COALESCE(u.${column}, '') !~* ${DEPOSITARY_RECEIPT_SQL_PATTERN} ELSE TRUE END`;
}

export const US_MASTER_NOT_DEPOSITARY_RECEIPT_SQL_WITH_PREFILTER = `${fastDepositaryReceiptCheckSql("english_name")} AND ${fastDepositaryReceiptCheckSql("name")}`;

export function hasDepositaryReceiptDescriptor(value: string | null | undefined) {
  return DEPOSITARY_RECEIPT_DESCRIPTOR_PATTERN.test(value ?? "");
}
