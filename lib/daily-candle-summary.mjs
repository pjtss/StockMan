/** Select the most recent traded candle per instrument for the daily summary cache. */
export function selectLatestDailySummaryRows(rows) {
  const latestByCode = new Map();
  for (const row of rows) {
    const date = String(row.date ?? "");
    if (!date || !(Number(row.volume) > 0) || !Number.isFinite(Number(row.close))) continue;
    const current = latestByCode.get(row.code);
    if (!current || date > String(current.date ?? "")) latestByCode.set(row.code, row);
  }
  return [...latestByCode.values()];
}
