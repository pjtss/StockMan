import { fetchSecFeed } from "./rss";
import type { FeedPayload, SecItem } from "./types";

export async function loadSecFeed(): Promise<FeedPayload<SecItem>> {
  return fetchSecFeed();
}
