const COMPACT_DATE = /^\d{8}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidIsoCalendarDate(value) {
  if (typeof value !== "string" || !ISO_DATE.test(value) || value.startsWith("0000")) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function isValidCompactCalendarDate(value) {
  if (typeof value !== "string" || !COMPACT_DATE.test(value) || value.startsWith("0000")) return false;
  return isValidIsoCalendarDate(`${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`);
}

export function isValidCompactCalendarDateRange(startDate, endDate) {
  return isValidCompactCalendarDate(startDate) && isValidCompactCalendarDate(endDate) && startDate <= endDate;
}
