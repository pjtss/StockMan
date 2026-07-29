import { fetchUsTurnoverRatioScanner } from "@/lib/us-turnover-ratio";
import { fetchUsMinuteTurnover, type UsMinuteTurnoverPoint } from "@/lib/kis-us-minute-turnover";
import { sendUsObvToDiscord } from "@/lib/discord-us-obv";

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

export async function runUsObvScan() {
  const scanner = await fetchUsTurnoverRatioScanner({ excd: "AMS" }, ["AMS", "NAS", "NYS"], { includeBelowMinTurnover: true });
  if (!scanner) throw new Error("KIS access token is unavailable");
  const candidates = scanner.filtered;
  const results: Array<Record<string, unknown>> = [];
  let next = 0;
  async function worker() {
    while (true) {
      const index = next++;
      if (index >= candidates.length) return;
      const item = candidates[index];
      try {
        const data = await fetchUsMinuteTurnover({ code: item.code, market: item.market });
        if (!data?.ok) throw new Error(`minute API HTTP ${data?.status ?? 0}`);
        results.push({ market: item.market, code: item.code, name: item.name, ...calculateObv(data.points), fetchedPointCount: data.points.length });
      } catch (error) {
        results.push({ market: item.market, code: item.code, name: item.name, error: error instanceof Error ? error.message : String(error) });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(5, candidates.length) }, () => worker()));
  const rising = results.filter((item) => item["trend"] === "RISING");
  const discord = await sendUsObvToDiscord(rising);
  if (!discord.ok) throw new Error(`US OBV Discord failed with HTTP ${discord.status}`);
  return { candidateCount: candidates.length, successCount: results.filter((item) => !item.error).length, failureCount: results.filter((item) => item.error).length, rising, discordSentCount: rising.length, results };
}
