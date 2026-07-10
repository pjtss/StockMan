import type { AlertItem, FeedPayload, SecItem } from "./types";
import { loadSecFeed } from "./sec-feed";
import { filterRecentSecItems } from "./sec-filters";
import { mapSecItemToAlert } from "./sec-mappers";

export async function syncSecAlerts(): Promise<FeedPayload<SecItem> & { newAlerts: AlertItem[] }> {
  const payload = await loadSecFeed();
  const recentItems = filterRecentSecItems(payload.items, 1);

  return {
    ...payload,
    newAlerts: recentItems.map(mapSecItemToAlert),
  };
}

export async function getTodaySecBullishFeed(): Promise<FeedPayload<SecItem>> {
  return loadSecFeed();
}
