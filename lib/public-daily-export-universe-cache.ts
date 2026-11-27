import type { PublicDailyExportMarket } from "@/lib/public-daily-export-timing";

export type PublicDailyExportUniverseKey = Readonly<{ market: string; code: string; name: string }>;
export type PublicDailyExportUniverseCacheStatus = "MISS" | "HIT" | "COALESCED";

const TTL_MS = 5 * 60_000;
type Entry = { rows: readonly PublicDailyExportUniverseKey[]; expiresAt: number };
type CacheGlobal = typeof globalThis & {
  __publicDailyExportUniverseCache?: Map<PublicDailyExportMarket, Entry>;
  __publicDailyExportUniverseInflight?: Map<PublicDailyExportMarket, Promise<readonly PublicDailyExportUniverseKey[]>>;
};

function entries() {
  const root = globalThis as CacheGlobal;
  root.__publicDailyExportUniverseCache ??= new Map();
  return root.__publicDailyExportUniverseCache;
}

function inflight() {
  const root = globalThis as CacheGlobal;
  root.__publicDailyExportUniverseInflight ??= new Map();
  return root.__publicDailyExportUniverseInflight;
}

export async function getOrLoadPublicDailyExportUniverse(
  market: PublicDailyExportMarket,
  load: () => Promise<readonly PublicDailyExportUniverseKey[]>,
) {
  const cache = entries();
  const entry = cache.get(market);
  if (entry && entry.expiresAt > Date.now()) {
    return { rows: entry.rows, status: "HIT" as const };
  }
  if (entry) cache.delete(market);

  const active = inflight();
  const pending = active.get(market);
  if (pending) return { rows: await pending, status: "COALESCED" as const };

  const loadPromise = Promise.resolve().then(load);
  active.set(market, loadPromise);
  try {
    const rows = await loadPromise;
    // An empty or failed master lookup must not become a reusable eligible universe.
    if (rows.length > 0) cache.set(market, { rows: [...rows], expiresAt: Date.now() + TTL_MS });
    return { rows, status: "MISS" as const };
  } finally {
    if (active.get(market) === loadPromise) active.delete(market);
  }
}

export function clearPublicDailyExportUniverseCache() {
  entries().clear();
  inflight().clear();
}
