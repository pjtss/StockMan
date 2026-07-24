import { inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { alertEvents } from "@/lib/schema";
import { loadAdminFeatureFlags } from "@/lib/admin-flags";
import { isUsTurnoverRatioOpen } from "@/lib/scanner-hours";
import { fetchUsTurnoverRatioScanner, type UsTurnoverRatioItem } from "@/lib/us-turnover-ratio";
import { saveAndCalculateUsTurnoverRatioTrends, type UsTurnoverRatioItemWithTrend } from "@/lib/us-turnover-ratio-trend";
import { isUsTurnoverRatioDiscordConfigured, sendUsTurnoverRatioToDiscord } from "@/lib/discord-us-turnover-ratio";
import { loadUsTurnoverFilterSettings } from "@/lib/us-turnover-settings";

function seoulDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
}

function seoulMinute() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date()).replace(/[^0-9]/g, "");
}

export async function runUsTurnoverRatioAutomation() {
  const flags = await loadAdminFeatureFlags();
  if (!flags.us_turnover_ratio) return { skipped: true, reason: "disabled", sent: 0 };
  if (!(await isUsTurnoverRatioOpen())) return { skipped: true, reason: "outside_schedule", sent: 0 };
  if (!isUsTurnoverRatioDiscordConfigured()) return { skipped: true, reason: "webhook_missing", sent: 0 };

  const result = await fetchUsTurnoverRatioScanner({ excd: "AMS" }, ["AMS", "NAS"]);
  if (!result) throw new Error("KIS access token is unavailable");
  if (!result.ok) throw new Error(`KIS turnover ratio API failed with HTTP ${result.status}`);

  const db = getDb();
  if (!db) throw new Error("Database connection is not available.");
  const trendedItems = await saveAndCalculateUsTurnoverRatioTrends(result.filtered);
  const settings = await loadUsTurnoverFilterSettings();
  const date = seoulDate();
  const minute = seoulMinute();
  const pendingNew: UsTurnoverRatioItemWithTrend[] = [];
  const pendingIncrease: UsTurnoverRatioItemWithTrend[] = [];
  const seenCodes = new Set<string>();
  const claimedIds: number[] = [];
  for (const item of trendedItems) {
    if (pendingNew.length + pendingIncrease.length >= 100) break;
    const hasTradingValueIncrease = item.trend.oneMinuteTradingValueIncrease !== null && item.trend.oneMinuteTradingValueIncrease >= settings.tradingValueIncreaseAlert;
    const shouldAlert = item.trend.isNew || hasTradingValueIncrease;
    if (!shouldAlert) continue;
    const code = item.code.toUpperCase();
    const marketCode = `${item.market.toUpperCase()}:${code}`;
    if (seenCodes.has(marketCode)) continue;
    seenCodes.add(marketCode);
    const alertType = item.trend.isNew ? "new" : "1m-increase";
    const externalId = `us-turnover-ratio:${date}:${item.market.toUpperCase()}:${code}:${alertType}:${minute}`;
    const claimed = await db.insert(alertEvents)
      .values({ source: "US_TURNOVER_RATIO", externalId })
      .onConflictDoNothing()
      .returning({ id: alertEvents.id });
    if (claimed.length > 0) {
      claimedIds.push(claimed[0].id);
      if (item.trend.isNew) pendingNew.push(item);
      else pendingIncrease.push(item);
    }
  }

  if (pendingNew.length + pendingIncrease.length === 0) return { skipped: false, sent: 0, matched: trendedItems.length };
  const newWebhook = process.env.US_TURNOVER_RATIO_NEW_DISCORD_WEBHOOK_URL?.trim() || "";
  const increaseWebhook = process.env.US_TURNOVER_RATIO_INCREASE_DISCORD_WEBHOOK_URL?.trim() || "";
  if (pendingNew.length > 0 && !newWebhook) throw new Error("New turnover ratio Discord webhook is not configured");
  if (pendingIncrease.length > 0 && !increaseWebhook) throw new Error("Increase turnover ratio Discord webhook is not configured");
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
  return { skipped: false, sent: pendingNew.length + pendingIncrease.length, matched: result.filtered.length };
}
