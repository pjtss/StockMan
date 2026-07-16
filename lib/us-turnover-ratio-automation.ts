import { eq, and } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { alertEvents } from "@/lib/schema";
import { loadAdminFeatureFlags } from "@/lib/admin-flags";
import { isUsTurnoverRatioOpen } from "@/lib/scanner-hours";
import { fetchUsTurnoverRatioScanner, type UsTurnoverRatioItem } from "@/lib/us-turnover-ratio";
import { saveAndCalculateUsTurnoverRatioTrends, type UsTurnoverRatioItemWithTrend } from "@/lib/us-turnover-ratio-trend";
import { isUsTurnoverRatioDiscordConfigured, sendUsTurnoverRatioToDiscord } from "@/lib/discord-us-turnover-ratio";

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
  const date = seoulDate();
  const pending: UsTurnoverRatioItemWithTrend[] = [];
  for (const item of trendedItems) {
    if (!(item.trend.oneMinuteTradingValueIncrease !== null && item.trend.oneMinuteTradingValueIncrease > 0)) continue;
    const externalId = `us-turnover-ratio:${date}:${item.code}:1m-increase:${seoulMinute()}`;
    const existing = await db.select({ id: alertEvents.id }).from(alertEvents).where(and(eq(alertEvents.source, "US_TURNOVER_RATIO"), eq(alertEvents.externalId, externalId))).limit(1);
    if (existing.length === 0) pending.push(item);
  }

  if (pending.length === 0) return { skipped: false, sent: 0, matched: trendedItems.length };
  const discord = await sendUsTurnoverRatioToDiscord(pending);
  if (!discord.ok) throw new Error(`US turnover ratio Discord failed with HTTP ${discord.status}`);
  for (const item of pending) {
    await db.insert(alertEvents).values({ source: "US_TURNOVER_RATIO", externalId: `us-turnover-ratio:${date}:${item.code}:1m-increase:${seoulMinute()}` }).onConflictDoNothing();
  }
  return { skipped: false, sent: pending.length, matched: result.filtered.length };
}
