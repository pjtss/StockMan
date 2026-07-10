import type { SecItem } from "./types";
import { extractSecAiText, fetchSecRawDocument } from "./sec-raw-document";

export type SecAiPayload = {
  accession: string;
  title: string;
  summary: string;
  formType: string;
  sentiment: string;
  link: string;
  text: string;
};

export async function buildSecAiPayload(item: SecItem): Promise<SecAiPayload> {
  const document = item.link ? await fetchSecRawDocument(item.link) : null;

  return {
    accession: item.accession,
    title: item.title,
    summary: item.summary,
    formType: item.formType,
    sentiment: item.sentiment,
    link: item.link,
    text: document ? extractSecAiText(document) : "",
  };
}
