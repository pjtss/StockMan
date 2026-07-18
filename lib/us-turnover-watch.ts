import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { alertEvents } from "@/lib/schema";
import { fetchKisUsPriceDetail, getKisUsPriceDetailOutput } from "@/lib/kis-us-price-detail";
import { calculateKisUsMarketCap } from "@/lib/kis-us-market-cap";
import { listUsTurnoverWatches } from "@/lib/us-turnover-watch-repository";
import { sendUsTurnoverWatchToDiscord } from "@/lib/discord-us-turnover-watch";
import { loadAdminFeatureFlags } from "@/lib/admin-flags";
import { isUsTurnoverWatchOpen } from "@/lib/scanner-hours";

const MARKETS = ["NAS", "AMS", "NYS"];

function positiveNumber(value: unknown) {
  const parsed = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function seoulDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
}

export async function runUsTurnoverWatchAutomation() {
  const flags = await loadAdminFeatureFlags();
  if (!flags.us_turnover_watch) return { skipped: true, reason: "disabled", watched: 0, matched: 0, sent: 0 };
  if (!(await isUsTurnoverWatchOpen())) return { skipped: true, reason: "outside_schedule", watched: 0, matched: 0, sent: 0 };
  const watches = await listUsTurnoverWatches();
  if (watches.length === 0) return { watched: 0, matched: 0, sent: 0 };
  const db = getDb();
  const date = seoulDate();
  const sent: Array<Record<string, unknown>> = [];

  for (const watch of watches) {
    for (const market of MARKETS) {
      const detail = await fetchKisUsPriceDetail({ code: watch.ticker, market });
      const output = getKisUsPriceDetailOutput(detail?.parsed);
      const marketCap = calculateKisUsMarketCap(output);
      const tradingValue = positiveNumber(output.tamt ?? output.tamnt);
      if (!detail?.ok || marketCap === null || tradingValue === null) continue;
      const ratio = (tradingValue / marketCap) * 100;
      if (ratio < watch.threshold) continue;

      const externalId = `us-turnover-watch:${date}:${watch.ticker}`;
      const claimed = await db.insert(alertEvents)
        .values({ source: "US_TURNOVER_RATIO_WATCH", externalId })
        .onConflictDoNothing()
        .returning({ id: alertEvents.id });
      if (claimed.length === 0) continue;
      sent.push({
        code: watch.ticker,
        market,
        threshold: watch.threshold,
        marketCap,
        tradingValue,
        turnoverRatio: ratio,
        changeRate: output.rate ?? output.last_rate ?? "-",
      });
    }
  }

  if (sent.length > 0) await sendUsTurnoverWatchToDiscord(sent);
  return { watched: watches.length, matched: sent.length, sent: sent.length };
}
