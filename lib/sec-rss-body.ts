import { fetchSecPrimaryDocument } from "./sec-primary-document";
import { prepareSecDocument } from "./sec-document-parser";
import { parseSecFilingUrl } from "./sec-filing-url";
import type { MarketRssItem } from "./market-rss";
import type { SecItem } from "./types";

export type SecRssBody = { formType: string; canonicalUrl: string; text: string; itemSections: string[] };

export function inferSecFormType(title: string) {
  return title.match(/\b(8-K|10-K|10-Q|20-F|6-K|SCHEDULE\s+13D\/?A?|SCHEDULE\s+13G\/?A?|4)\b/i)?.[1]?.toUpperCase() || "";
}

export async function fetchSecRssBody(item: MarketRssItem): Promise<SecRssBody> {
  const formType = inferSecFormType(item.title);
  if (!formType) throw new Error("SEC form type could not be inferred from RSS title");
  const urlInfo = parseSecFilingUrl(item.link);
  const secItem: SecItem = { source: "SEC", accession: urlInfo.accessionNumber, company: item.title, formType, sentiment: "중요공시", publishedAt: item.publishedAt || "", title: item.title, summary: item.summary, link: item.link };
  const resolved = await fetchSecPrimaryDocument(secItem);
  const prepared = prepareSecDocument(resolved.document.html);
  return { formType, canonicalUrl: resolved.urlInfo.canonicalUrl, text: prepared.aiText, itemSections: prepared.sections.map((section) => section.item) };
}
