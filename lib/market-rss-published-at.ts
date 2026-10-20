const publishedAtFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Format an RSS timestamp in KST without falling back to the browser's local timezone. */
export function formatMarketRssPublishedAt(value: string | Date | null | undefined) {
  if (value == null || value === "") return "발행 시각 없음";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "발행 시각 확인 필요";
  const parts = Object.fromEntries(publishedAtFormatter.formatToParts(date).map(({ type, value: part }) => [type, part]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute} KST`;
}
