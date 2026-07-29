import { fetchUsTurnoverRatioScanner } from "@/lib/us-turnover-ratio";
import { fetchUsMinuteTurnover, type UsMinuteTurnoverPoint } from "@/lib/kis-us-minute-turnover";
import { sendUsObvToDiscord } from "@/lib/discord-us-obv";
import { getDb } from "@/lib/db";
import { usTurnoverRatioSnapshots } from "@/lib/schema";
import { and, gte, lte } from "drizzle-orm";

export function calculateObv(points: UsMinuteTurnoverPoint[]) {
  const ordered = [...points].sort((a, b) => a.time.localeCompare(b.time));
  let obv = 0;
  let risingBars = 0;
  for (let index = 1; index < ordered.length; index += 1) {
    if (ordered[index].price > ordered[index - 1].price) { obv += ordered[index].amount; risingBars += 1; }
    else if (ordered[index].price < ordered[index - 1].price) obv -= ordered[index].amount;
  }
  const recent = ordered.slice(-30);
  const recentObv = calculateObvValue(recent);
  return { pointCount: ordered.length, obv, recentObv, risingBars, trend: recentObv > 0 ? "RISING" : recentObv < 0 ? "FALLING" : "FLAT" };
}

function calculateObvValue(points: UsMinuteTurnoverPoint[]) {
  let value = 0;
  for (let index = 1; index < points.length; index += 1) {
    if (points[index].price > points[index - 1].price) value += points[index].amount;
    else if (points[index].price < points[index - 1].price) value -= points[index].amount;
  }
  return value;
}

export async function runUsObvScan(options: { sendDiscord?: boolean } = {}) {
  const scanner = await fetchUsTurnoverRatioScanner({ excd: "AMS" }, ["AMS", "NAS", "NYS"], { includeBelowMinTurnover: false });
  if (!scanner) throw new Error("KIS access token is unavailable");
  const candidates = scanner.filtered.filter((item) => Number.isFinite(item.turnoverRatio) && item.turnoverRatio >= 1);
  const db = getDb();
  if (db) {
    const now = new Date();
    const seoul = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const sessionStart = new Date(Date.UTC(seoul.getUTCFullYear(), seoul.getUTCMonth(), seoul.getUTCDate(), 9) - 9 * 60 * 60 * 1000);
    const sessionRows = await db.select({ market: usTurnoverRatioSnapshots.market, code: usTurnoverRatioSnapshots.code, name: usTurnoverRatioSnapshots.name, turnoverRatio: usTurnoverRatioSnapshots.turnoverRatio }).from(usTurnoverRatioSnapshots).where(and(gte(usTurnoverRatioSnapshots.observedAt, sessionStart), lte(usTurnoverRatioSnapshots.observedAt, now)));
    const seen = new Set(candidates.map((item) => `${item.market}:${item.code}`.toUpperCase()));
    for (const row of sessionRows) {
      if (row.turnoverRatio === null || row.turnoverRatio < 1) continue;
      const key = `${row.market}:${row.code}`.toUpperCase();
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({ market: row.market, rank: 0, code: row.code, name: row.name, price: "", changeRate: "", marketCap: 0, tradingValue: 0, turnoverRatio: 0, openToHighRate: 0 });
    }
  }
  const results: Array<Record<string, unknown>> = [];
  let next = 0;
  async function worker() {
    while (true) {
      const index = next++;
      if (index >= candidates.length) return;
      const item = candidates[index];
      try {
        let data = await fetchUsMinuteTurnover({ code: item.code, market: item.market });
        if (data && !data.ok && data.status >= 500) {
          await new Promise((resolve) => setTimeout(resolve, 400));
          data = await fetchUsMinuteTurnover({ code: item.code, market: item.market });
        }
        if (!data?.ok) {
          const parsed = data?.response.parsed as Record<string, unknown> | null;
          results.push({ market: item.market, code: item.code, name: item.name, error: `minute API HTTP ${data?.status ?? 0}`, httpStatus: data?.status ?? 0, rtCd: parsed?.rt_cd ?? null, msgCd: parsed?.msg_cd ?? null, msg1: parsed?.msg1 ?? null, rawText: data?.response.rawText?.slice(0, 1000) ?? null, fetchedPointCount: 0 });
          continue;
        }
        if (data.points.length === 0) {
          const parsed = data.response.parsed as Record<string, unknown> | null;
          results.push({ market: item.market, code: item.code, name: item.name, error: "minute API returned no bars", httpStatus: data.status, rtCd: parsed?.rt_cd ?? null, msgCd: parsed?.msg_cd ?? null, msg1: parsed?.msg1 ?? null, rawText: data.response.rawText.slice(0, 1000), fetchedPointCount: 0 });
          continue;
        }
        results.push({ market: item.market, code: item.code, name: item.name, ...calculateObv(data.points), fetchedPointCount: data.points.length });
      } catch (error) {
        results.push({ market: item.market, code: item.code, name: item.name, error: error instanceof Error ? error.message : String(error) });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(5, candidates.length) }, () => worker()));
  const rising = results.filter((item) => item["trend"] === "RISING");
  const discord = options.sendDiscord ? await sendUsObvToDiscord(rising) : null;
  if (discord && !discord.ok) throw new Error(`US OBV Discord failed with HTTP ${discord.status}`);
  return { candidateCount: candidates.length, successCount: results.filter((item) => !item.error).length, failureCount: results.filter((item) => item.error).length, rising, discordSentCount: discord ? rising.length : 0, discordMode: options.sendDiscord ? "SENT" : "PREVIEW", results };
}
