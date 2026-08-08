import { inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { alertEvents, usTurnoverRatioSnapshotAttempts } from "@/lib/schema";
import { fetchUsTurnoverRatioScanner, type UsTurnoverRatioItem } from "@/lib/us-turnover-ratio";
import { saveAndCalculateUsTurnoverRatioTrends, type UsTurnoverRatioItemWithTrend } from "@/lib/us-turnover-ratio-trend";
import { buildUsTurnoverRatioDiscordPayload, sendUsTurnoverRatioToDiscord } from "@/lib/discord-us-turnover-ratio";
import { enqueueDiscordDelivery } from "@/lib/discord-delivery-queue";
import { loadUsTurnoverFilterSettings } from "@/lib/us-turnover-settings";
import { loadFeatureModuleSettings } from "@/lib/feature-module-settings";
import { isWithinSchedule } from "@/lib/schedule-time";
import { recordSkippedAutomationRun, startAutomationRun, finishAutomationRun } from "@/lib/automation-run-repository";
import { loadLatestUsTradeIntensity } from "@/lib/us-trade-intensity-repository";
import { ensureUsInstrument } from "@/lib/us-instruments";
import { loadFeatureDiscordWebhook } from "@/lib/discord-config";
import { describeError } from "@/lib/error-diagnostics";

export function meetsTradingValueIncreaseAlert(value: number | null, threshold: number) {
  return value !== null && Number.isFinite(value) && value >= threshold;
}

export function meetsTradeIntensityFilter(value: number | null, threshold: number) {
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
  const moduleSettings = await loadFeatureModuleSettings("us-turnover-ratio");
  if (!moduleSettings.enabled) return { skipped: true, reason: "disabled", sent: 0 };
  if (!isWithinSchedule(moduleSettings, new Date())) return { skipped: true, reason: "outside_schedule", sent: 0 };
  const result = await fetchUsTurnoverRatioScanner({ excd: "AMS" }, ["AMS", "NAS", "NYS"], { includeBelowMinTurnover: true });
  if (!result) throw new Error("KIS access token is unavailable");
  if (!result.ok) throw new Error(`KIS turnover ratio API failed with HTTP ${result.status}`);

  const db = getDb();
  if (!db) throw new Error("Database connection is not available.");
  const observedAt = new Date();
  const snapshotPersistFailures: Array<Record<string, unknown>> = [];
  for (const attempt of result.debug?.snapshotAttempts ?? []) {
    try {
      const instrumentId = await ensureUsInstrument({ market: attempt.market, code: attempt.code, name: attempt.name });
      await db.insert(usTurnoverRatioSnapshotAttempts).values({ ...attempt, instrumentId: instrumentId ?? null, observedAt });
    } catch (error) {
      // Preserve the rest of the scan when one stale/malformed instrument
      // cannot be linked. The debug API receives the exact symbol and safe
      // database diagnostics for follow-up.
      snapshotPersistFailures.push({ market: attempt.market, code: attempt.code, diagnostics: describeError(error) });
    }
  }
  const settings = await loadUsTurnoverFilterSettings();
  // Persist every successful detailed quote first. Alert eligibility is a
  // separate concern; this preserves outliers such as GCTK for later analysis.
  const detailItems: UsTurnoverRatioItem[] = (result.output ?? []).flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const row = raw as Record<string, unknown>;
    const market = String(row.__market ?? "").toUpperCase();
    const marketCap = Number(row.__priceDetailMarketCap);
    const tradingValue = Number(row.__priceDetailTradingValue);
    const code = String(row.symb ?? row.rsym ?? row.code ?? "").trim();
    if (!market || !code || !Number.isFinite(marketCap) || !Number.isFinite(tradingValue)) return [];
    const price = String(row.last ?? row.price ?? "");
    const changeRate = String(row.rate ?? row.changeRate ?? row.n_rate ?? "");
    return [{ market, rank: Number(row.rank) || 0, code, name: String(row.name ?? row.company ?? ""), price, changeRate, marketCap, tradingValue, turnoverRatio: marketCap > 0 ? (tradingValue / marketCap) * 100 : 0, openToHighRate: Number(row.__openToHighRate) || 0, open: Number(row.__priceDetailOpen) || null, high: Number(row.__priceDetailHigh) || null, low: Number(row.__priceDetailLow) || null }];
  });
  const trendedItems = await saveAndCalculateUsTurnoverRatioTrends(detailItems);
  const eligibleKeys = new Set(result.filtered.map((item) => `${item.market.toUpperCase()}:${item.code.toUpperCase()}`));
  const alertItems = trendedItems.filter((item) => eligibleKeys.has(`${item.market.toUpperCase()}:${item.code.toUpperCase()}`));
  const date = seoulDate();
  const pendingNew: UsTurnoverRatioItemWithTrend[] = [];
  const pendingIncrease: UsTurnoverRatioItemWithTrend[] = [];
  const seenCodes = new Set<string>();
  const claimedIds: number[] = [];
  for (const item of alertItems) {
    if (pendingNew.length + pendingIncrease.length >= 100) break;
    const firstAppearance = item.trend.snapshotState === "NEW" || item.trend.snapshotState === "RECOVERED";
    if (!firstAppearance && item.turnoverRatio < settings.minTurnoverRatio) continue;
    const hasTradingValueIncrease = meetsTradingValueIncreaseAlert(item.trend.oneMinuteTradingValueIncrease, settings.tradingValueIncreaseAlert);
    const hasRvol = meetsTradingValueIncreaseAlert(item.trend.oneMinuteTradingValueRvol, settings.minTradingValueRvol);
    const hasIncreaseRate = meetsTradingValueIncreaseAlert(item.trend.oneMinuteTradingValueIncreaseRate, settings.minTradingValueIncreaseRate);
    const hasPersistence = item.trend.persistenceWindowCount >= settings.minPersistenceWindows;
    const intensity = firstAppearance ? null : await loadLatestUsTradeIntensity({ market: item.market, code: item.code }, new Date(Date.now() - 5 * 60_000));
    const meetsIntensityFilter = firstAppearance || meetsTradeIntensityFilter(intensity, settings.minIntensity);
    const shouldAlert = firstAppearance || (hasTradingValueIncrease && hasRvol && hasIncreaseRate && hasPersistence && meetsIntensityFilter);
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
  const filterFailureCounts = result.debug?.filterFailureCounts ?? {};
  if (pendingNew.length + pendingIncrease.length === 0) return { skipped: false, sent: 0, matched: alertItems.length, snapshotCount: trendedItems.length, newCount: 0, increaseCount: 0, stateCounts, filterFailureCounts, snapshotPersistFailureCount: snapshotPersistFailures.length, snapshotPersistFailures: snapshotPersistFailures.slice(0, 25), sourceCount: result.debug?.sourceCount ?? 0, priceDetailAttemptCount: result.debug?.priceDetailAttemptCount ?? 0, priceDetailSuccessCount: result.debug?.priceDetailSuccessCount ?? 0 };
  const unifiedWebhook = await loadFeatureDiscordWebhook("us-turnover-ratio", ["US_TURNOVER_RATIO_INCREASE_DISCORD_WEBHOOK_URL", "US_TURNOVER_RATIO_NEW_DISCORD_WEBHOOK_URL"]);
  const newWebhook = unifiedWebhook;
  const increaseWebhook = unifiedWebhook;
  if (pendingNew.length > 0 && !newWebhook || pendingIncrease.length > 0 && !increaseWebhook) {
    return { skipped: true, reason: "webhook_missing_after_snapshot", sent: 0, matched: trendedItems.length, newCount: pendingNew.length, increaseCount: pendingIncrease.length, stateCounts, snapshotPersistFailureCount: snapshotPersistFailures.length, snapshotPersistFailures: snapshotPersistFailures.slice(0, 25), sourceCount: result.debug?.sourceCount ?? 0, priceDetailAttemptCount: result.debug?.priceDetailAttemptCount ?? 0, priceDetailSuccessCount: result.debug?.priceDetailSuccessCount ?? 0 };
  }
  const newDiscord = pendingNew.length > 0
    ? await sendUsTurnoverRatioToDiscord(pendingNew, newWebhook)
    : null;
  const increaseDiscord = pendingIncrease.length > 0
    ? await sendUsTurnoverRatioToDiscord(pendingIncrease, increaseWebhook)
    : null;
  if (newDiscord && !newDiscord.ok || increaseDiscord && !increaseDiscord.ok) {
    if (newDiscord && !newDiscord.ok && pendingNew.length > 0) {
      await enqueueDiscordDelivery({ externalId: `retry:US_TURNOVER_RATIO_NEW:${date}:${Date.now()}`, channelKey: "US_TURNOVER_RATIO_NEW", payload: buildUsTurnoverRatioDiscordPayload(pendingNew) });
    }
    if (increaseDiscord && !increaseDiscord.ok && pendingIncrease.length > 0) {
      await enqueueDiscordDelivery({ externalId: `retry:US_TURNOVER_RATIO_INCREASE:${date}:${Date.now()}`, channelKey: "US_TURNOVER_RATIO_INCREASE", payload: buildUsTurnoverRatioDiscordPayload(pendingIncrease) });
    }
    await db.delete(alertEvents).where(inArray(alertEvents.id, claimedIds));
    const failed = [newDiscord, increaseDiscord].find((result) => result && !result.ok);
    throw new Error(`US turnover ratio Discord failed with HTTP ${failed?.status}`);
  }
  return { skipped: false, sent: pendingNew.length + pendingIncrease.length, matched: result.filtered.length, snapshotCount: trendedItems.length, newCount: pendingNew.length, increaseCount: pendingIncrease.length, stateCounts, filterFailureCounts, snapshotPersistFailureCount: snapshotPersistFailures.length, snapshotPersistFailures: snapshotPersistFailures.slice(0, 25), sourceCount: result.debug?.sourceCount ?? 0, priceDetailAttemptCount: result.debug?.priceDetailAttemptCount ?? 0, priceDetailSuccessCount: result.debug?.priceDetailSuccessCount ?? 0 };
}

export async function runUsTurnoverRatioAutomation() {
  const moduleSettings = await loadFeatureModuleSettings("us-turnover-ratio");
  const skipReason = !moduleSettings.enabled ? "disabled" : !isWithinSchedule(moduleSettings, new Date()) ? "outside_schedule" : null;
  if (skipReason) {
    await recordSkippedAutomationRun("us-turnover-ratio", skipReason);
    return { skipped: true, reason: skipReason, sent: 0 };
  }
  const runId = await startAutomationRun("us-turnover-ratio");
  try {
    const result = await executeUsTurnoverRatioAutomation();
    await finishAutomationRun(runId, result.skipped ? "SKIPPED" : "SUCCESS", result);
    return result;
  } catch (error) {
    const diagnostics = describeError(error);
    await finishAutomationRun(runId, "FAILED", { diagnostics }, diagnostics.message);
    throw error;
  }
}
