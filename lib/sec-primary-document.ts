import { isSecHttpsUrl, parseSecFilingUrl, type SecFilingUrlInfo } from "./sec-filing-url";
import { fetchSecRawDocument, type SecRawDocument } from "./sec-raw-document";
import type { SecItem } from "./types";

export type ResolvedSecPrimaryDocument = {
  indexUrl: string;
  urlInfo: SecFilingUrlInfo;
  document: SecRawDocument;
};

function normalizeCell(value: string) {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function normalizeFormType(value: string) {
  return value.toUpperCase().replace(/\s+/g, " ").trim();
}

export function isSecFilingIndexUrl(url: string) {
  return /-index\.html?$/i.test(new URL(url).pathname);
}

export function extractSecPrimaryDocumentUrl(indexUrl: string, html: string, formType: string) {
  const expectedForm = normalizeFormType(formType);
  const rows = html.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || [];
  let sequenceOneUrl = "";

  for (const row of rows) {
    const cells = [...row.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)]
      .map((match) => normalizeCell(match[1]));
    const href = row.match(/<a\b[^>]*href=["']([^"']+)["']/i)?.[1];
    if (!href || cells.length < 3) continue;

    const resolvedUrl = new URL(href.replace(/&amp;/gi, "&"), indexUrl).toString();
    if (cells[0] === "1" && !sequenceOneUrl) sequenceOneUrl = resolvedUrl;

    const description = cells[1] || "";
    const documentType = cells[3] || "";
    if (documentType === expectedForm || description === expectedForm) {
      return resolvedUrl;
    }
  }

  return sequenceOneUrl;
}

export async function fetchSecPrimaryDocument(item: SecItem): Promise<ResolvedSecPrimaryDocument> {
  if (!item.link || !isSecHttpsUrl(item.link)) {
    throw new Error("SEC filing URL is invalid");
  }

  const indexUrl = parseSecFilingUrl(item.link).canonicalUrl;
  if (!isSecFilingIndexUrl(indexUrl)) {
    return {
      indexUrl,
      urlInfo: parseSecFilingUrl(indexUrl),
      document: await fetchSecRawDocument(indexUrl),
    };
  }

  const indexDocument = await fetchSecRawDocument(indexUrl);
  const primaryUrl = extractSecPrimaryDocumentUrl(indexUrl, indexDocument.html, item.formType);
  if (!primaryUrl || !isSecHttpsUrl(primaryUrl)) {
    throw new Error(`SEC primary document was not found for form ${item.formType}`);
  }

  return {
    indexUrl,
    urlInfo: parseSecFilingUrl(primaryUrl),
    document: await fetchSecRawDocument(primaryUrl),
  };
}
