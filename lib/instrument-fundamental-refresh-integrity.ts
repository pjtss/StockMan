export type InstrumentFundamentalRefreshCounts = {
  active_instruments: number;
  refreshed_active_instruments: number;
  missing_active_instruments: number;
  history_rows: number;
  instruments: number;
  turnover_rows: number;
  market_cap_rows: number;
  snapshot_market_cap_mismatch_rows: number;
  invalid_price_rows: number;
  invalid_market_cap_rows: number;
  overseas_turnover_source_mismatch_rows: number;
  snapshot_sync_mismatch_rows: number;
};

export function isInstrumentFundamentalRefreshComplete(counts: InstrumentFundamentalRefreshCounts) {
  return counts.active_instruments > 0
    && counts.active_instruments === counts.refreshed_active_instruments
    && counts.instruments === counts.active_instruments
    && counts.missing_active_instruments === 0
    && counts.history_rows === counts.turnover_rows
    && counts.history_rows === counts.market_cap_rows
    && counts.snapshot_market_cap_mismatch_rows === 0
    && counts.invalid_price_rows === 0
    && counts.invalid_market_cap_rows === 0
    && counts.overseas_turnover_source_mismatch_rows === 0
    && counts.snapshot_sync_mismatch_rows === 0;
}
