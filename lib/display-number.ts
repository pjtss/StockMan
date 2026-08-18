/** User-facing numeric formatting. Calculations and raw API payloads must keep their original precision. */
export function formatDisplayNumber(value: number | null | undefined, suffix = "") {
  if (value == null || !Number.isFinite(value)) return "-";
  return `${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}${suffix}`;
}

export function formatDisplayPercent(value: number | null | undefined) {
  return formatDisplayNumber(value, "%");
}
