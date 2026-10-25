/** Interleave per-source queues, each of which is already ordered oldest-first. */
export function interleaveMarketRssSourceQueues<T extends { source: string }>(queues: readonly (readonly T[])[], limit: number) {
  const rows: T[] = [];
  for (let index = 0; rows.length < limit; index++) {
    let found = false;
    for (const queue of queues) {
      const row = queue[index];
      if (!row) continue;
      rows.push(row);
      found = true;
      if (rows.length >= limit) break;
    }
    if (!found) break;
  }
  return rows;
}
