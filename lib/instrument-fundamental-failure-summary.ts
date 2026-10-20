export type InstrumentFundamentalFailure = {
  market: string;
  code: string;
  error: string;
};

export type InstrumentFundamentalFailureSummary = {
  market: string;
  reason: string;
  count: number;
};

function reasonFromError(error: string) {
  return error.match(/^([A-Z][A-Z0-9_]{2,79})/)?.[1] ?? "OTHER";
}

export function createInstrumentFundamentalFailureAggregator() {
  const counts = new Map<string, InstrumentFundamentalFailureSummary>();

  return {
    record(market: string, error: string) {
      const reason = reasonFromError(error);
      const key = `${market}\u0000${reason}`;
      const current = counts.get(key);
      if (current) current.count += 1;
      else counts.set(key, { market, reason, count: 1 });
    },
    snapshot(): InstrumentFundamentalFailureSummary[] {
      return [...counts.values()].map((item) => ({ ...item })).sort((left, right) =>
        left.market.localeCompare(right.market)
        || right.count - left.count
        || left.reason.localeCompare(right.reason),
      );
    },
  };
}

/**
 * Aggregate operational failure families without echoing provider messages,
 * which may contain request-specific or otherwise sensitive details.
 */
export function summarizeInstrumentFundamentalFailures(
  failures: readonly InstrumentFundamentalFailure[],
): InstrumentFundamentalFailureSummary[] {
  const aggregator = createInstrumentFundamentalFailureAggregator();
  for (const failure of failures) aggregator.record(failure.market, failure.error);
  return aggregator.snapshot();
}
