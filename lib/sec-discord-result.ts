import type { SecAiEvaluationResult } from "./sec-ai-evaluator";
import type { SecAiPayload } from "./sec-ai-payload";
import type { SecDiscordResult } from "./discord-sec";
import type { SecFilingUrlInfo } from "./sec-filing-url";
import type { SecItem } from "./types";

export function buildSecDiscordResult(
  item: SecItem,
  urlInfo: SecFilingUrlInfo,
  payload: SecAiPayload,
  aiEvaluation: SecAiEvaluationResult,
): SecDiscordResult {
  return {
    request: {
      url: urlInfo.canonicalUrl,
      originalUrl: item.link,
    },
    urlInfo: {
      canonicalUrl: urlInfo.canonicalUrl,
      accessionNumber: urlInfo.accessionNumber || item.accession,
      documentFile: urlInfo.documentFile,
    },
    document: {
      metadata: payload.metadata,
      events: payload.events,
    },
    aiEvaluation,
  };
}
