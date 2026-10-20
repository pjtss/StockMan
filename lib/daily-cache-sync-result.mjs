export function isDailyCacheWriteVerified(expectedRows, verifiedRows) {
  return Number.isInteger(expectedRows)
    && expectedRows > 0
    && Number.isInteger(verifiedRows)
    && verifiedRows === expectedRows;
}

export function isDailyCacheSyncSuccessful(markets, fallbackFailed) {
  const results = Object.values(markets);
  return results.length > 0
    && fallbackFailed === 0
    && results.every((result) => result.universe > 0
      && result.failed === 0
      && result.fetched > 0
      && result.saved === result.fetched);
}
