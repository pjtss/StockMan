import type { AlertItem, SecItem } from "./types";

export function mapSecItemToAlert(item: SecItem): AlertItem {
  return {
    source: item.source,
    externalId: item.accession || item.link,
    level: item.sentiment,
    company: item.company,
    title: item.title,
    link: item.link,
    publishedAt: item.publishedAt,
  };
}
