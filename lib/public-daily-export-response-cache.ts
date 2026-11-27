import type { PublicDailyExportFormat } from "@/lib/public-daily-export";
import type { PublicDailyExportMarket } from "@/lib/public-daily-export-timing";

const TTL_MS = 60_000;
const STALE_GRACE_MS = 60_000;
const MAX_ENTRIES = 4;
const MAX_ENTRY_BYTES = 16 * 1024 * 1024;
const MAX_TOTAL_BYTES = 32 * 1024 * 1024;

type CacheEntry = { bytes: Uint8Array; expiresAt: number; staleUntil: number };
type CacheGlobal = typeof globalThis & { __publicDailyExportResponseCache?: Map<string, CacheEntry> };

export type CachedPublicDailyExport = { bytes: Uint8Array; state: "HIT" | "STALE" };

function cache() {
  const root = globalThis as CacheGlobal;
  root.__publicDailyExportResponseCache ??= new Map();
  return root.__publicDailyExportResponseCache;
}

function key(market: PublicDailyExportMarket, format: PublicDailyExportFormat) {
  return `${market}:${format}`;
}

export function getCachedPublicDailyExport(market: PublicDailyExportMarket, format: PublicDailyExportFormat) {
  const entries = cache();
  const entryKey = key(market, format);
  const entry = entries.get(entryKey);
  if (!entry) return null;
  const now = Date.now();
  if (entry.staleUntil <= now) {
    entries.delete(entryKey);
    return null;
  }
  // Refresh insertion order for predictable least-recently-used eviction.
  entries.delete(entryKey);
  entries.set(entryKey, entry);
  return {
    bytes: entry.bytes.slice(),
    state: entry.expiresAt <= now ? "STALE" : "HIT",
  } satisfies CachedPublicDailyExport;
}

export function setCachedPublicDailyExport(
  market: PublicDailyExportMarket,
  format: PublicDailyExportFormat,
  bytes: Uint8Array,
) {
  const entries = cache();
  const entryKey = key(market, format);
  if (bytes.byteLength > MAX_ENTRY_BYTES) return;
  entries.delete(entryKey);
  const expiresAt = Date.now() + TTL_MS;
  entries.set(entryKey, { bytes: bytes.slice(), expiresAt, staleUntil: expiresAt + STALE_GRACE_MS });
  const totalBytes = () => Array.from(entries.values()).reduce((total, entry) => total + entry.bytes.byteLength, 0);
  while (entries.size > MAX_ENTRIES || totalBytes() > MAX_TOTAL_BYTES) {
    const oldestKey = entries.keys().next().value as string | undefined;
    if (oldestKey === undefined) break;
    entries.delete(oldestKey);
  }
}

export function clearPublicDailyExportResponseCache() {
  cache().clear();
}
