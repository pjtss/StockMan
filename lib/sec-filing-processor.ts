import { evaluateSecFilingWithAi, type SecAiEvaluationResult } from "./sec-ai-evaluator";
import { buildSecAiPayloadFromDocument, type SecAiPayload } from "./sec-ai-payload";
import { buildSecDiscordResult } from "./sec-discord-result";
import { sendSecResultToDiscord, type DiscordSendResult } from "./discord-sec";
import type { SecFilingUrlInfo } from "./sec-filing-url";
import { fetchSecPrimaryDocument } from "./sec-primary-document";
import type { SecItem } from "./types";

export type SecFilingProcessingResult = {
  externalId: string;
  urlInfo: SecFilingUrlInfo;
  payload: SecAiPayload;
  aiEvaluation: SecAiEvaluationResult;
  discord: DiscordSendResult;
};

export async function processSecFiling(item: SecItem): Promise<SecFilingProcessingResult> {
  const { urlInfo, document } = await fetchSecPrimaryDocument(item);
  const payload = buildSecAiPayloadFromDocument(
    urlInfo.canonicalUrl,
    document.html,
    item,
    urlInfo,
  );
  const aiEvaluation = await evaluateSecFilingWithAi(payload);

  if (aiEvaluation.skipped) {
    throw new Error(`SEC AI evaluation skipped: ${aiEvaluation.reason}`);
  }

  const discordResult = buildSecDiscordResult(item, urlInfo, payload, aiEvaluation);
  const discord = await sendSecResultToDiscord(discordResult);
  if (!discord.ok) {
    throw new Error(`SEC Discord send failed: ${discord.status}`);
  }

  return {
    externalId: item.accession || urlInfo.accessionNumber || urlInfo.canonicalUrl,
    urlInfo,
    payload,
    aiEvaluation,
    discord,
  };
}
