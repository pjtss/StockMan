/** Summarize persisted latest-candle coverage against the requested instrument universe. */
export function summarizeDailyCandleCoverage(universeRows, persistedParts, sampleLimit = 10) {
  const latestByInstrument = new Map();
  for (const part of persistedParts) {
    const market = String(part.market ?? "").trim().toUpperCase();
    for (const item of part.candles ?? []) {
      const code = String(item.code ?? "").trim().toUpperCase();
      if (!market || !code) continue;
      let latest = null;
      for (const candle of item.candles ?? []) {
        const date = String(candle.date ?? "");
        if (date && (!latest || date > latest)) latest = date;
      }
      if (!latest) continue;
      const key = `${market}:${code}`;
      const previous = latestByInstrument.get(key);
      if (!previous || latest > previous.date) latestByInstrument.set(key, { market, code, date: latest });
    }
  }

  const requestedByMarket = new Map();
  for (const row of universeRows) {
    const market = String(row.market ?? "").trim().toUpperCase();
    const code = String(row.code ?? "").trim().toUpperCase();
    if (!market || !code) continue;
    const codes = requestedByMarket.get(market) ?? new Set();
    codes.add(code);
    requestedByMarket.set(market, codes);
  }

  return [...requestedByMarket.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([market, requestedCodes]) => {
    const instruments = [...requestedCodes].map((code) => latestByInstrument.get(`${market}:${code}`) ?? null);
    const available = instruments.filter(Boolean);
    const marketLatestCandleDate = available.reduce((latest, item) => !latest || item.date > latest ? item.date : latest, null);
    const atMarketLatest = marketLatestCandleDate
      ? available.filter((item) => item.date === marketLatestCandleDate).length
      : 0;
    const lagging = available
      .filter((item) => item.date < marketLatestCandleDate)
      .sort((a, b) => a.date.localeCompare(b.date) || a.code.localeCompare(b.code));
    return {
      market,
      requestedInstruments: requestedCodes.size,
      persistedInstruments: available.length,
      missingInstruments: requestedCodes.size - available.length,
      marketLatestCandleDate,
      instrumentsAtMarketLatest: atMarketLatest,
      laggingInstruments: lagging.length,
      laggingSample: lagging.slice(0, Math.max(0, Math.floor(sampleLimit))).map(({ code, date }) => ({ code, latestCandleDate: date })),
    };
  });
}
