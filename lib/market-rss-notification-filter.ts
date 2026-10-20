export type MarketRssNotificationFilter = "all" | "PENDING" | "PROCESSING" | "SENDING" | "SENT" | "FAILED" | "SKIPPED" | "UNCERTAIN";

export function matchesMarketRssNotificationFilter(
  article: { notificationStatus: string },
  filter: MarketRssNotificationFilter,
) {
  return filter === "all" || article.notificationStatus === filter;
}
