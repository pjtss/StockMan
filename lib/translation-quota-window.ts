const PACIFIC_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Los_Angeles",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function pacificDateKey(value: Date) {
  const parts = PACIFIC_DATE_FORMATTER.formatToParts(value);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) throw new Error("Unable to determine Pacific calendar date");
  return `${year}-${month}-${day}`;
}

/** Start of the current Google Cloud daily-quota date, including DST transitions. */
export function getPacificQuotaDayStart(now = new Date()) {
  const dateKey = pacificDateKey(now);
  let low = now.getTime() - 36 * 60 * 60_000;
  let high = now.getTime();
  if (pacificDateKey(new Date(low)) >= dateKey) throw new Error("Unable to locate the start of the Pacific quota day");
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (pacificDateKey(new Date(middle)) >= dateKey) high = middle;
    else low = middle;
  }
  return new Date(high);
}

/** Next Pacific midnight, which is the earliest retry point after daily quota exhaustion. */
export function getNextPacificQuotaDayStart(now = new Date()) {
  const dateKey = pacificDateKey(now);
  let low = now.getTime();
  let high = now.getTime() + 36 * 60 * 60_000;
  if (pacificDateKey(new Date(high)) <= dateKey) throw new Error("Unable to locate the next Pacific quota day");
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (pacificDateKey(new Date(middle)) > dateKey) high = middle;
    else low = middle;
  }
  return new Date(high);
}
