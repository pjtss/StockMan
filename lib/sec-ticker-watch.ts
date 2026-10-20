import { resolveSecTickerCandidates, type SecTickerRow } from "./sec-company-ticker";

export const SEC_WATCH_EXCHANGES = new Set(["Nasdaq", "NYSE", "AMEX", "NYSE MKT", "NYSE American"]);

export type SecTickerWatchTarget = SecTickerRow & { requestedTicker: string };

function normalizeTicker(value: string) {
  return value.trim().toUpperCase();
}

function isAllowedExchange(exchange: string) {
  return SEC_WATCH_EXCHANGES.has(exchange.trim().toUpperCase()) || ["NASDAQ", "NYS", "AMS"].includes(exchange.trim().toUpperCase());
}

/** Resolves user tickers to unique CIK/exchange targets and rejects unsupported exchanges. */
export async function resolveSecTickerWatchTargets(tickers: string[]) {
  const targets: SecTickerWatchTarget[] = [];
  const seen = new Set<string>();
  for (const raw of tickers) {
    const requestedTicker = normalizeTicker(raw);
    if (!requestedTicker) continue;
    const candidates = await resolveSecTickerCandidates(requestedTicker);
    for (const candidate of candidates) {
      if (!isAllowedExchange(candidate.exchange)) continue;
      const key = `${candidate.cik}:${candidate.exchange}`;
      if (seen.has(key)) continue;
      seen.add(key);
      targets.push({ ...candidate, requestedTicker });
    }
  }
  return targets;
}

export function dedupeSecTickerWatchTargets(targets: SecTickerWatchTarget[]) {
  const byCik = new Map<string, SecTickerWatchTarget>();
  for (const target of targets) {
    const current = byCik.get(target.cik);
    if (!current || current.requestedTicker.localeCompare(target.requestedTicker) > 0) byCik.set(target.cik, target);
  }
  return [...byCik.values()];
}
