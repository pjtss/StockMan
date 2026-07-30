export function formatKoreanAmount(value: number) {
  if (!Number.isFinite(value)) return "-";
  const amount = Math.round(Math.abs(value));
  const sign = value < 0 ? "-" : "";
  const eok = Math.floor(amount / 100_000_000);
  const man = Math.floor((amount % 100_000_000) / 10_000);
  const remainder = amount % 10_000;
  const parts: string[] = [];

  if (eok > 0) parts.push(`${eok}억`);
  if (man > 0) parts.push(`${man}만`);
  if (remainder > 0 || parts.length === 0) parts.push(String(remainder));
  return `${sign}${parts.join(" ")}`;
}

/** Compact display for dollar amounts/share counts while keeping raw values unchanged. */
export function formatKoreanCompact(value: number | null | undefined, suffix = "") {
  if (value == null || !Number.isFinite(value)) return "-";
  const sign = value < 0 ? "-" : "";
  const amount = Math.abs(value);
  const unit = amount >= 100_000_000 ? { divisor: 100_000_000, label: "억" } : amount >= 10_000 ? { divisor: 10_000, label: "만" } : null;
  if (!unit) return `${sign}${amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}${suffix}`;
  const scaled = amount / unit.divisor;
  return `${sign}${scaled.toLocaleString("en-US", { maximumFractionDigits: 2 })}${unit.label}${suffix}`;
}
