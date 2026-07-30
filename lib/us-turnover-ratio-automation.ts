import { inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { alertEvents, usTurnoverRatioSnapshotAttempts } from "@/lib/schema";
import { loadAdminFeatureFlags } from "@/lib/admin-flags";
import { fetchUsTurnoverRatioScanner, type UsTurnoverRatioItem } from "@/lib/us-turnover-ratio";
import { saveAndCalculateUsTurnoverRatioTrends, type UsTurnoverRatioItemWithTrend } from "@/lib/us-turnover-ratio-trend";
import { sendUsTurnoverRatioToDiscord } from "@/lib/discord-us-turnover-ratio";
import { loadUsTurnoverFilterSettings } from "@/lib/us-turnover-settings";
import { loadFeatureModuleSettings } from "@/lib/feature-module-settings";
import { isWithinSchedule } from "@/lib/scanner-schedules";
import { startAutomationRun, finishAutomationRun } from "@/lib/automation-run-repository";

export function meetsTradingValueIncreaseAlert(value: number | null, threshold: number) {
  return value !== null && Number.isFinite(value) && value >= threshold;
}

function seoulDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
}

function snapshotStateCounts(items: UsTurnoverRatioItemWithTrend[]) {
  return items.reduce<Record<string, number>>((counts, item) => {
    const state = item.trend.snapshotState;
    counts[state] = (counts[state] || 0) + 1;
    return counts;
  }, {});
}

async function executeUsTurnoverRatioAutomation() {
  const flags = await loadAdminFeatureFlags();
  const moduleSettings = await loadFeatureModuleSettings("us-turnover-ratio");
  if (!flags.us_turnover_ratio || !moduleSettings.enabled) return { skipped: true, reason: "disabled", sent: 0 };
  if (!isWithinSchedule(moduleSettings, new Date())) return { skipped: true, reason: "outside_schedule", sent: 0 };
  const result = await fetchUsTurnoverRatioScanner({ excd: "AMS" }, ["AMS", "NAS", "NYS"], { includeBelowMinTurnover: true });
  if (!result) throw new Error("KIS access token is unavailable");
  if (!result.ok) throw new Error(`KIS turnover ratio API failed with HTTP ${result.status}`);

  const db = getDb();
  if (!db) throw new Error("Database connection is not available.");
  const observedAt = new Date();
  for (const attempt of result.debug?.snapshotAttempts ?? []) {
    await db.insert(usTurnoverRatioSnapshotAttempts).values({ ...attempt, observedAt });
  }
  const settings = await loadUsTurnoverFilterSettings();
  // The scanner applies these filters, but enforce the ratio bounds again at
  // the notification boundary so no stale or bypassed candidate can alert.
  const filteredItems = result.filtered.filter((item) =>
    Number.isFinite(item.turnoverRatio) && item.turnoverRatio <= settings.maxTurnoverRatio,
  );
  const trendedItems = await saveAndCalculateUsTurnoverRatioTrends(filteredItems);
  const date = seoulDate();
  const pendingNew: UsTurnoverRatioItemWithTrend[] = [];
  const pendingIncrease: UsTurnoverRatioItemWithTrend[] = [];
  const seenCodes = new Set<string>();
  const claimedIds: number[] = [];
  for (const item of trendedItems) {
    if (pendingNew.length + pendingIncrease.length >= 100) break;
    const firstAppearance = item.trend.snapshotState === "NEW" || item.trend.snapshotState === "RECOVERED";
    if (!firstAppearance && item.turnoverRatio < settings.minTurnoverRatio) continue;
    const hasTradingValueIncrease = meetsTradingValueIncreaseAlert(item.trend.oneMinuteTradingValueIncrease, settings.tradingValueIncreaseAlert);
    const shouldAlert = firstAppearance || hasTradingValueIncrease;
    if (!shouldAlert) continue;
    const code = item.code.toUpperCase();
    const marketCode = `${item.market.toUpperCase()}:${code}`;
    if (seenCodes.has(marketCode)) continue;
    seenCodes.add(marketCode);
    const alertType = firstAppearance ? item.trend.snapshotState.toLowerCase() : "1m-increase";
    const cooldownBucket = Math.floor(Date.now() / 1000 / Math.max(1, moduleSettings.cooldownSeconds));
    const externalId = `us-turnover-ratio:${date}:${item.market.toUpperCase()}:${code}:${alertType}:${cooldownBucket}`;
    const claimed = await db.insert(alertEvents)
      .values({ source: "US_TURNOVER_RATIO", externalId })
      .onConflictDoNothing()
      .returning({ id: alertEvents.id });
    if (claimed.length > 0) {
      claimedIds.push(claimed[0].id);
      if (firstAppearance) pendingNew.push(item);
      else pendingIncrease.push(item);
    }
  }

  const stateCounts = snapshotStateCounts(trendedItems);
  if (pendingNew.length + pendingIncrease.length === 0) return { skipped: false, sent: 0, matched: trendedItems.length, newCount: 0, increaseCount: 0, stateCounts, sourceCount: result.debug?.sourceCount ?? 0, priceDetailAttemptCount: result.debug?.priceDetailAttemptCount ?? 0, priceDetailSuccessCount: result.debug?.priceDetailSuccessCount ?? 0 };
  const newWebhook = process.env.US_TURNOVER_RATIO_NEW_DISCORD_WEBHOOK_URL?.trim() || "";
  const increaseWebhook = process.env.US_TURNOVER_RATIO_INCREASE_DISCORD_WEBHOOK_URL?.trim() || "";
  if (pendingNew.length > 0 && !newWebhook || pendingIncrease.length > 0 && !increaseWebhook) {
    return { skipped: true, reason: "webhook_missing_after_snapshot", sent: 0, matched: trendedItems.length, newCount: pendingNew.length, increaseCount: pendingIncrease.length, stateCounts, sourceCount: result.debug?.sourceCount ?? 0, priceDetailAttemptCount: result.debug?.priceDetailAttemptCount ?? 0, priceDetailSuccessCount: result.debug?.priceDetailSuccessCount ?? 0 };
  }
  const newDiscord = pendingNew.length > 0
    ? await sendUsTurnoverRatioToDiscord(pendingNew, newWebhook)
    : null;
  const increaseDiscord = pendingIncrease.length > 0
    ? await sendUsTurnoverRatioToDiscord(pendingIncrease, increaseWebhook)
    : null;
  if (newDiscord && !newDiscord.ok || increaseDiscord && !increaseDiscord.ok) {
    await db.delete(alertEvents).where(inArray(alertEvents.id, claimedIds));
    const failed = [newDiscord, increaseDiscord].find((result) => result && !result.ok);
    throw new Error(`US turnover ratio Discord failed with HTTP ${failed?.status}`);
  }
  return { skipped: false, sent: pendingNew.length + pendingIncrease.length, matched: result.filtered.length, newCount: pendingNew.length, increaseCount: pendingIncrease.length, stateCounts, sourceCount: result.debug?.sourceCount ?? 0, priceDetailAttemptCount: result.debug?.priceDetailAttemptCount ?? 0, priceDetailSuccessCount: result.debug?.priceDetailSuccessCount ?? 0 };
}

export async function runUsTurnoverRatioAutomation() {
  const runId = await startAutomationRun("us-turnover-ratio");
  try {
    const result = await executeUsTurnoverRatioAutomation();
    await finishAutomationRun(runId, "SUCCESS", result);
    return result;
  } catch (error) {
    await finishAutomationRun(runId, "FAILED", {}, error instanceof Error ? error.message : String(error));
    throw error;
  }
}
