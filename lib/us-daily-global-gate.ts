export async function isDailyCandleAutomationEnabled() {
  // Daily candle caches and their dependent scans are controlled by their own
  // feature-module settings. The legacy indicator toggle must not disable
  // cache refreshes (or leave the cache stale while indicators are off).
  return true;
}
