import { fetchOpenDartToday } from "./dart-opendart-client";
import {
  mapDartCandidateToAlert,
  mapOpenDartRowsToCandidates,
  type DartAutomationCandidate,
} from "./dart-automation-mapper";
import {
  claimDartAutomation,
  markDartAutomationDelivered,
  markDartAutomationFailed,
} from "./dart-automation-store";
import { isDartDiscordConfigured, sendDartAlertToDiscord } from "./discord-dart";
import { sendPushAlerts } from "./push";

export type DartAutomationItemResult = {
  externalId: string;
  status: "delivered" | "failed";
  error?: string;
};

async function deliverCandidate(candidate: DartAutomationCandidate, detectedAt: string) {
  const alert = mapDartCandidateToAlert(candidate, detectedAt);

  try {
    const [, discordResult] = await Promise.all([
      sendPushAlerts([alert]),
      sendDartAlertToDiscord(alert),
    ]);
    if (!discordResult.ok) {
      throw new Error(`DART Discord webhook failed with HTTP ${discordResult.status}`);
    }
    await markDartAutomationDelivered(candidate.receiptNo);
    return { externalId: candidate.receiptNo, status: "delivered" as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await markDartAutomationFailed(candidate.receiptNo, message);
    return { externalId: candidate.receiptNo, status: "failed" as const, error: message };
  }
}

export async function runDartAutomation() {
  if (!isDartDiscordConfigured()) {
    return {
      source: "DART" as const,
      skipped: true,
      reason: "DART_DISCORD_WEBHOOK_URL is not configured",
      pagesFetched: 0,
      totalDisclosures: 0,
      candidates: 0,
      claimed: 0,
      delivered: 0,
      failed: 0,
      results: [] as DartAutomationItemResult[],
    };
  }

  const feed = await fetchOpenDartToday();
  const candidates = mapOpenDartRowsToCandidates(feed.rows);
  const claimedIds = await claimDartAutomation(candidates.map((item) => item.receiptNo));
  const claimedItems = candidates.filter((item) => claimedIds.has(item.receiptNo));
  const results: DartAutomationItemResult[] = [];

  for (const item of claimedItems) {
    results.push(await deliverCandidate(item, feed.fetchedAt));
  }

  return {
    source: "DART" as const,
    fetchedAt: feed.fetchedAt,
    dateKey: feed.dateKey,
    pagesFetched: feed.pagesFetched,
    totalDisclosures: feed.totalCount,
    candidates: candidates.length,
    claimed: claimedItems.length,
    delivered: results.filter((result) => result.status === "delivered").length,
    failed: results.filter((result) => result.status === "failed").length,
    results,
  };
}
