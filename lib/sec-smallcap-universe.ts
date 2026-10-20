import { and, eq, inArray, lte, isNotNull } from "drizzle-orm";
import { getDb } from "./db";
import { instrumentFundamentalSnapshots, usCommonStockUniverse } from "./schema";
import { resolveSecTickerCandidates } from "./sec-company-ticker";
import type { SecTickerWatchTarget } from "./sec-ticker-watch";

export const SEC_SMALLCAP_MAX_USD = 100_000_000;
const ALLOWED_MARKETS = ["NASDAQ", "NAS", "NYSE", "NYS", "AMEX", "AMS"] as const;

/**
 * Uses the project's latest USD fundamental snapshot as the market-cap source.
 * Missing or non-positive market cap is fail-closed and never enters the SEC set.
 */
export async function loadSecSmallcapTickerTargets(): Promise<SecTickerWatchTarget[]> {
  const rows = await getDb().select({ ticker: usCommonStockUniverse.code, name: usCommonStockUniverse.name, market: usCommonStockUniverse.market, marketCap: instrumentFundamentalSnapshots.marketCap })
    .from(usCommonStockUniverse)
    .innerJoin(instrumentFundamentalSnapshots, and(eq(instrumentFundamentalSnapshots.market, usCommonStockUniverse.market), eq(instrumentFundamentalSnapshots.code, usCommonStockUniverse.code)))
    .where(and(eq(usCommonStockUniverse.enabled, true), inArray(usCommonStockUniverse.market, [...ALLOWED_MARKETS]), eq(instrumentFundamentalSnapshots.currency, "USD"), isNotNull(instrumentFundamentalSnapshots.marketCap), lte(instrumentFundamentalSnapshots.marketCap, SEC_SMALLCAP_MAX_USD)));

  const targets: SecTickerWatchTarget[] = [];
  for (const row of rows) {
    if (!row.marketCap || row.marketCap <= 0) continue;
    const candidates = await resolveSecTickerCandidates(row.ticker);
    for (const candidate of candidates) {
      if (["NASDAQ", "NYS", "NYSE", "AMS", "AMEX"].includes(candidate.exchange.toUpperCase())) {
        targets.push({ ...candidate, requestedTicker: row.ticker.toUpperCase() });
      }
    }
  }
  return targets;
}
