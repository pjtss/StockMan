import type { SecItem } from "./types";
import { minutesAgo } from "./utils";

export function filterRecentSecItems(items: SecItem[], maxMinutes = 1): SecItem[] {
  return items.filter((item) => minutesAgo(item.publishedAt) <= maxMinutes);
}
