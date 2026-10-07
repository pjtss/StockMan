export type RssTimeWindow = { start: Date; end: Date; hours: number };

export function parseRssHours(value: string | null): number | null {
  if (value === null) return null;
  if (!/^\d+$/.test(value)) return Number.NaN;
  const hours = Number(value);
  return Number.isSafeInteger(hours) && hours >= 1 && hours <= 24 ? hours : Number.NaN;
}

export function createRssTimeWindow(hours: number, now = new Date()): RssTimeWindow {
  return { start: new Date(now.getTime() - hours * 60 * 60 * 1000), end: new Date(now), hours };
}
