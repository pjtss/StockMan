import type { SecItem } from "./types";
import { extractSecAiText, fetchSecRawDocument } from "./sec-raw-document";
import { prepareSecDocument, type SecDocumentMetadata, type SecDocumentSection } from "./sec-document-parser";
import { buildSecFilingTitle } from "./sec-title";

export type SecAiPayload = {
  accession: string;
  title: string;
  summary: string;
  formType: string;
  sentiment: string;
  link: string;
  text: string;
  promptText: string;
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
  const title = buildSecFilingTitle(prepared.metadata, prepared.sections, fallback?.title);
  return {
    accession: fallback?.accession || prepared.metadata.accessionNumber,
    title,
    summary: fallback?.summary || "",
    formType: fallback?.formType || prepared.metadata.documentType || "",
    sentiment: fallback?.sentiment || "",
    link: fallback?.link || prepared.metadata.canonicalUrl || url,
    text: prepared.aiText,
    promptText: prepared.promptText,
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
    summary: item.summary,
    formType: item.formType,
    sentiment: item.sentiment,
    link: item.link,
    text: preparedPayload?.text || (document ? extractSecAiText(document) : ""),
    promptText: preparedPayload?.promptText || "",
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
