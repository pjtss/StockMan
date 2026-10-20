export type MarketRssNotificationSnapshotSource = {
  source: string;
  title: string;
  summary: string;
  translatedTitle: string | null;
  translationStatus: string;
  translationFallback: boolean;
  translationSkippedReason: string | null;
  translationError: string | null;
  detectedTicker: string | null;
  link: string;
  publishedAt: Date | string | null;
};

export type MarketRssNotificationSnapshot = Omit<MarketRssNotificationSnapshotSource, "publishedAt"> & {
  publishedAt: string | null;
};

const SNAPSHOT_FIELDS = [
  "source",
  "title",
  "summary",
  "translatedTitle",
  "translationStatus",
  "translationFallback",
  "translationSkippedReason",
  "translationError",
  "detectedTicker",
  "link",
  "publishedAt",
] as const;

export function createMarketRssNotificationSnapshot(row: MarketRssNotificationSnapshotSource): MarketRssNotificationSnapshot {
  return {
    source: row.source,
    title: row.title,
    summary: row.summary,
    translatedTitle: row.translatedTitle,
    translationStatus: row.translationStatus,
    translationFallback: row.translationFallback,
    translationSkippedReason: row.translationSkippedReason,
    translationError: row.translationError,
    detectedTicker: row.detectedTicker,
    link: row.link,
    publishedAt: row.publishedAt instanceof Date ? row.publishedAt.toISOString() : row.publishedAt,
  };
}

export function isMarketRssNotificationSnapshot(value: unknown): value is MarketRssNotificationSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const snapshot = value as Record<string, unknown>;
  if (SNAPSHOT_FIELDS.some((field) => !(field in snapshot))) return false;
  return typeof snapshot.source === "string"
    && typeof snapshot.title === "string"
    && typeof snapshot.summary === "string"
    && (typeof snapshot.translatedTitle === "string" || snapshot.translatedTitle === null)
    && typeof snapshot.translationStatus === "string"
    && typeof snapshot.translationFallback === "boolean"
    && (typeof snapshot.translationSkippedReason === "string" || snapshot.translationSkippedReason === null)
    && (typeof snapshot.translationError === "string" || snapshot.translationError === null)
    && (typeof snapshot.detectedTicker === "string" || snapshot.detectedTicker === null)
    && typeof snapshot.link === "string"
    && (typeof snapshot.publishedAt === "string" || snapshot.publishedAt === null);
}

export function matchesMarketRssNotificationSnapshot(
  snapshot: MarketRssNotificationSnapshot,
  row: MarketRssNotificationSnapshotSource,
) {
  const current = createMarketRssNotificationSnapshot(row);
  return SNAPSHOT_FIELDS.every((field) => snapshot[field] === current[field]);
}
