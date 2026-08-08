import { isSecAiEvaluationConfigured } from "./sec-ai-evaluator";
import { syncSecAlerts } from "./sec-alerts";
import {
  claimSecAutomation,
  markSecAutomationDelivered,
  markSecAutomationFailed,
} from "./sec-automation-store";
import { isSecDiscordConfigured } from "./discord-sec";
import { processSecFiling } from "./sec-filing-processor";
import { filterRecentSecItems } from "./sec-filters";
import type { SecItem } from "./types";

/**
 * Legacy direct SEC RSS application service.
 *
 * Scheduled execution is intentionally disabled: SEC EDGAR RSS is now owned by
 * the market-rss pipeline. This module remains available for compatibility and
 * isolated tests until the legacy public SEC feed surface is retired.
 */

const AUTOMATION_LOOKBACK_MINUTES = 10;
const MAX_FILINGS_PER_RUN = 1;

export type SecAutomationItemResult = {
  externalId: string;
  status: "delivered" | "failed";
  error?: string;
};

function getExternalId(item: SecItem) {
  return item.accession || item.link;
}

async function getMissingConfiguration() {
  return [
    isSecAiEvaluationConfigured() ? "" : "OPENAI_API_KEY",
    (await isSecDiscordConfigured()) ? "" : "SEC_DISCORD_WEBHOOK_URL",
  ].filter(Boolean);
}

async function processClaimedItem(item: SecItem): Promise<SecAutomationItemResult> {
  const externalId = getExternalId(item);

  try {
    await processSecFiling(item);
    await markSecAutomationDelivered(externalId);
    return { externalId, status: "delivered" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await markSecAutomationFailed(externalId, message);
    return { externalId, status: "failed", error: message };
  }
}

export async function runSecAutomation() {
  const feed = await syncSecAlerts();
  const missingConfiguration = await getMissingConfiguration();
  if (missingConfiguration.length > 0) {
    return {
      ...feed,
      automation: {
        skipped: true,
        reason: `Missing configuration: ${missingConfiguration.join(", ")}`,
        candidates: 0,
        claimed: 0,
        delivered: 0,
        failed: 0,
        results: [] as SecAutomationItemResult[],
      },
    };
  }

  const candidates = filterRecentSecItems(feed.items, AUTOMATION_LOOKBACK_MINUTES)
    .sort((left, right) => Date.parse(left.publishedAt) - Date.parse(right.publishedAt));
  const claimedItems: SecItem[] = [];

  for (const item of candidates) {
    if (claimedItems.length >= MAX_FILINGS_PER_RUN) break;
    const externalId = getExternalId(item);
    if (externalId && (await claimSecAutomation(externalId))) {
      claimedItems.push(item);
    }
  }

  const results = await Promise.all(claimedItems.map(processClaimedItem));

  return {
    ...feed,
    automation: {
      skipped: false,
      candidates: candidates.length,
      claimed: claimedItems.length,
      delivered: results.filter((result) => result.status === "delivered").length,
      failed: results.filter((result) => result.status === "failed").length,
      results,
    },
  };
}
