type RawRssItem = Record<string, unknown>;

/**
 * Classify only timestamps whose raw RSS/Atom value carries an explicit time
 * and timezone. Database timestamps alone cannot prove the provider's precision.
 */
export function classifyRssTimestamp(rawPayload: string | null | undefined): { precision: "INSTANT" | "DATE" | "UNKNOWN"; date: string | null } {
  if (!rawPayload) return { precision: "UNKNOWN", date: null };
  let raw: unknown;
  try {
    raw = JSON.parse(rawPayload);
  } catch {
    return { precision: "UNKNOWN", date: null };
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { precision: "UNKNOWN", date: null };
  const item = raw as RawRssItem;
  const value = item.pubDate ?? item.published ?? item.updated;
  if (typeof value !== "string") return { precision: "UNKNOWN", date: null };
  const timestamp = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(timestamp)) return { precision: "DATE", date: timestamp };
  const hasExplicitZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(timestamp) || /\b(?:GMT|UTC)\b/i.test(timestamp);
  const hasTime = /\d{1,2}:\d{2}/.test(timestamp);
  if (!hasExplicitZone || !hasTime) return { precision: "UNKNOWN", date: null };
  const parsed = new Date(timestamp);
  return Number.isNaN(parsed.getTime()) ? { precision: "UNKNOWN", date: null } : { precision: "INSTANT", date: null };
}
