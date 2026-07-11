import type { SecItem } from "./types";
import { extractSecAiText, fetchSecRawDocument } from "./sec-raw-document";
import { prepareSecDocument, type SecDocumentMetadata, type SecDocumentSection } from "./sec-document-parser";
import { buildSecEventsPromptText, parseSecEventsByForm, type SecParsedEvent } from "./sec-parser-router";
import { buildSecFilingTitle } from "./sec-title";

export type SecAiPayload = {
  accession: string;
  title: string;
  company: string;
  ticker: string;
  reportDate: string;
  summary: string;
  formType: string;
  sentiment: string;
  link: string;
  text: string;
  promptText: string;
  events: SecParsedEvent[];
  metadata: SecDocumentMetadata;
  sections: SecDocumentSection[];
};

export function buildSecAiPayloadFromDocument(
  url: string,
  html: string,
  fallback?: Partial<SecAiPayload>,
  urlInfo?: Partial<Pick<SecDocumentMetadata, "cik" | "accessionNumber" | "documentFile" | "canonicalUrl">>,
): SecAiPayload {
  const prepared = prepareSecDocument(html, urlInfo);
  const events = parseSecEventsByForm(prepared.metadata, prepared.fullText, prepared.sections);
  const title = buildSecFilingTitle(prepared.metadata, prepared.sections, fallback?.title);
  const text = events.length > 0 ? events.map((event) => event.text).join("\n\n") : prepared.aiText;
  const promptText = buildSecEventsPromptText(prepared.metadata, events);
  return {
    accession: fallback?.accession || prepared.metadata.accessionNumber,
    title,
    company: prepared.metadata.registrantName || fallback?.company || "",
    ticker: prepared.metadata.tradingSymbol || fallback?.ticker || "",
    reportDate: prepared.metadata.reportDate || fallback?.reportDate || "",
    summary: fallback?.summary || "",
    formType: fallback?.formType || prepared.metadata.documentType || "",
    sentiment: fallback?.sentiment || "",
    link: prepared.metadata.canonicalUrl || url || fallback?.link || "",
    text,
    promptText,
    events,
    metadata: prepared.metadata,
    sections: prepared.sections,
  };
}

export async function buildSecAiPayload(item: SecItem): Promise<SecAiPayload> {
  const document = item.link ? await fetchSecRawDocument(item.link) : null;
  const preparedPayload = document ? buildSecAiPayloadFromDocument(document.url, document.html, item) : null;

  return {
    accession: item.accession,
    title: item.title,
    company: item.company,
    ticker: "",
    reportDate: item.publishedAt,
    summary: item.summary,
    formType: item.formType,
    sentiment: item.sentiment,
    link: item.link,
    text: preparedPayload?.text || (document ? extractSecAiText(document) : ""),
    promptText: preparedPayload?.promptText || "",
    events: preparedPayload?.events || [],
    metadata: preparedPayload?.metadata || {
      documentType: item.formType,
      registrantName: item.company,
      tradingSymbol: "",
      reportDate: item.publishedAt,
      cik: "",
      accessionNumber: item.accession,
      documentFile: "",
      canonicalUrl: item.link,
    },
    sections: preparedPayload?.sections || [],
  };
}
