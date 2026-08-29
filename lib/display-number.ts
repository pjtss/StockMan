/** User-facing numeric formatting. Calculations and raw API payloads must keep their original precision. */
export function formatDisplayNumber(value: number | null | undefined, suffix = "") {
  if (value == null || !Number.isFinite(value)) return "-";
  return `${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}${suffix}`;
}

export function formatDisplayPercent(value: number | null | undefined) {
  return formatDisplayNumber(value, "%");
}

export function formatDisplaySigned(value: number | null | undefined, suffix = "") {
  if (value == null || !Number.isFinite(value)) return "-";
  return `${value >= 0 ? "+" : ""}${formatDisplayNumber(value)}${suffix}`;
}

export function formatDisplayInteger(value: number | null | undefined, suffix = "") {
  if (value == null || !Number.isFinite(value)) return "-";
  return `${Math.round(value).toLocaleString("en-US")}${suffix}`;
}

/** Compact share volume for cards, retaining raw precision in the API. */
export function formatDisplayVolume(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "미확인";
  const amount = Math.round(value);
  if (Math.abs(amount) >= 10_000) {
    return `${(amount / 10_000).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}만주`;
  }
  return `${amount.toLocaleString("ko-KR")}주`;
}

export function formatDisplayCurrency(value: number | null | undefined, currency = "$") {
  const formatted = formatDisplayNumber(value);
  return formatted === "-" ? formatted : `${currency}${formatted}`;
}

/** Consistent compact amount for cards and modal summaries. */
export function formatDisplayAmount(value: number | null | undefined, currency: "KRW" | "USD") {
  if (value == null || !Number.isFinite(value)) return "미확인";
  const sign = value < 0 ? "-" : "";
  const amount = Math.abs(value);
  const units = currency === "KRW"
    ? [{ divisor: 1_000_000_000_000, label: "조" }, { divisor: 100_000_000, label: "억" }, { divisor: 10_000, label: "만" }]
    : [{ divisor: 1_000_000_000, label: "B" }, { divisor: 1_000_000, label: "M" }, { divisor: 1_000, label: "K" }];
  const unit = units.find((item) => amount >= item.divisor);
  if (!unit) return `${sign}${currency === "USD" ? "$" : ""}${amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}${currency === "KRW" ? "원" : ""}`;
  return `${sign}${currency === "USD" ? "$" : ""}${(amount / unit.divisor).toLocaleString("en-US", { maximumFractionDigits: 2 })}${unit.label}`;
}

/** Consistent KST timestamp for user-facing data freshness labels. */
export function formatDisplayDateTime(value: string | Date | null | undefined) {
  if (!value) return "미확인";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "미확인";
  return date.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short" });
}

export function formatDisplayDate(value: string | Date | null | undefined) {
  if (!value) return "미확인";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "미확인";
  return date.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium" });
}
