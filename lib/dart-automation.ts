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
import { sendPushAlerts, type PushAlertDeliverySummary } from "./push";

export type DartChannelDeliverySummary = {
  discord: { disposition: "PROVIDER_ACCEPTED" | "FAILED" | "UNKNOWN"; statusCode?: number };
  push: PushAlertDeliverySummary;
};

export type DartAutomationItemResult = {
  externalId: string;
  status: "delivered" | "failed";
  error?: string;
  channels: DartChannelDeliverySummary;
};

async function deliverCandidate(candidate: DartAutomationCandidate, detectedAt: string) {
  const alert = mapDartCandidateToAlert(candidate, detectedAt);
  const unknownPushSummary: PushAlertDeliverySummary = {
    disposition: "UNKNOWN",
    alerts: 1,
    subscriptionsLoaded: 0,
    eligible: 0,
    providerAccepted: 0,
    expired: 0,
    failed: 0,
    unknown: 1,
    cleanupFailed: 0,
    skippedByPreference: 0,
    deviceDelivery: "UNOBSERVED",
  };
  const channels: DartChannelDeliverySummary = {
    discord: { disposition: "UNKNOWN" },
    push: unknownPushSummary,
  };

  try {
    const [pushSettled, discordSettled] = await Promise.allSettled([
      sendPushAlerts([alert]),
      sendDartAlertToDiscord(alert),
    ]);
    if (pushSettled.status === "fulfilled") channels.push = pushSettled.value;
    if (discordSettled.status === "fulfilled") {
      const discordResult = discordSettled.value;
      channels.discord = {
        disposition: discordResult.ok ? "PROVIDER_ACCEPTED" : discordResult.status >= 500 ? "UNKNOWN" : "FAILED",
        statusCode: discordResult.status,
      };
    }

    if (discordSettled.status === "rejected" || channels.discord.disposition !== "PROVIDER_ACCEPTED") {
      const message = discordSettled.status === "fulfilled"
        ? `DART Discord webhook failed with HTTP ${discordSettled.value.status}`
        : discordSettled.reason instanceof Error ? discordSettled.reason.message : String(discordSettled.reason);
      await markDartAutomationFailed(candidate.receiptNo, message);
      return { externalId: candidate.receiptNo, status: "failed" as const, error: message, channels };
    }

    await markDartAutomationDelivered(candidate.receiptNo);
    return { externalId: candidate.receiptNo, status: "delivered" as const, channels };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await markDartAutomationFailed(candidate.receiptNo, message);
    return { externalId: candidate.receiptNo, status: "failed" as const, error: message, channels };
  }
}

export async function runDartAutomation() {
  if (!(await isDartDiscordConfigured())) {
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
    ok: feed.reconciliationState === "RECONCILED",
    source: "DART" as const,
    fetchedAt: feed.fetchedAt,
    dateKey: feed.dateKey,
    pagesFetched: feed.pagesFetched,
    expectedPages: feed.expectedPages,
    totalDisclosures: feed.totalCount,
    rawRowCount: feed.rawRowCount,
    uniqueReceiptCount: feed.uniqueReceiptCount,
    duplicateReceiptCount: feed.duplicateReceiptCount,
    missingReceiptCount: feed.missingReceiptCount,
    reconciliationState: feed.reconciliationState,
    candidates: candidates.length,
    claimed: claimedItems.length,
    delivered: results.filter((result) => result.status === "delivered").length,
    failed: results.filter((result) => result.status === "failed").length,
    results,
  };
}
