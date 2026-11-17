const seoulDateFormatter = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function getSeoulDateKey(date = new Date()): string {
  return seoulDateFormatter.format(date);
}

export function formatSeoulDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const formatter = new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "Asia/Seoul",
    hourCycle: "h23",
  });
  return formatter.formatToParts(date).map((part) => part.type === "hour" ? part.value.padStart(2, "0") : part.value).join("");
}
