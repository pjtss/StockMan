import { createHash } from "node:crypto";

export type InstrumentFundamentalRefreshScopeItem = {
  market: string;
  code: string;
  reason: string;
};

export type InstrumentFundamentalUniverseEntry = {
  market: string;
  code: string;
  source: string;
};

export function findDuplicateInstrumentFundamentalUniverseEntries(entries: InstrumentFundamentalUniverseEntry[]) {
  const sourcesByIdentity = new Map<string, { market: string; code: string; sources: string[] }>();
  for (const { market, code, source } of entries) {
    const key = JSON.stringify([market, code]);
    const existing = sourcesByIdentity.get(key);
    if (existing) existing.sources.push(source);
    else sourcesByIdentity.set(key, { market, code, sources: [source] });
  }
  return [...sourcesByIdentity.values()]
    .filter(({ sources }) => sources.length > 1)
    .map(({ market, code, sources }) => ({ market, code, sources: [...new Set(sources)].sort() }))
    .sort((left, right) => left.market.localeCompare(right.market) || left.code.localeCompare(right.code));
}

/** Stable approval fingerprint for the exact instrument + failure-reason set. */
export function fingerprintInstrumentFundamentalRefreshScope(items: InstrumentFundamentalRefreshScopeItem[]) {
  const canonical = items
    .map(({ market, code, reason }) => [market, code, reason].join("\0"))
    .sort()
    .join("\n");
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export function assertInstrumentFundamentalRefreshScopeMatches(
  items: InstrumentFundamentalRefreshScopeItem[],
  expectedCount: number,
  expectedFingerprint: string,
) {
  if (items.length === 0) {
    throw new Error("Refusing to apply an empty instrument refresh scope; no KIS calls made");
  }
  const instrumentKeys = new Set<string>();
  for (const item of items) {
    if (!item.market.trim() || !item.code.trim() || !item.reason.trim()) {
      throw new Error("Refresh scope contains an empty market, code, or reason; no KIS calls made");
    }
    const key = JSON.stringify([item.market, item.code]);
    if (instrumentKeys.has(key)) {
      throw new Error(`Refresh scope contains duplicate instrument ${item.market}/${item.code}; no KIS calls made`);
    }
    instrumentKeys.add(key);
  }
  const fingerprint = fingerprintInstrumentFundamentalRefreshScope(items);
  if (!Number.isInteger(expectedCount) || items.length !== expectedCount || fingerprint !== expectedFingerprint) {
    throw new Error(`Retry scope changed: expected count=${expectedCount} fingerprint=${expectedFingerprint}, found count=${items.length} fingerprint=${fingerprint}; no KIS calls made`);
  }
  return fingerprint;
}
