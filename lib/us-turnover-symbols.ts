import { getDb } from "./db";
import { usInstruments, usTurnoverSymbols, usTurnoverWatchlist } from "./schema";
import { ensureUsInstrument } from "./us-daily-breakout-watchlist";
import { asc, eq, inArray } from "drizzle-orm";

const STORAGE_KEY = "default";

function normalizeSymbols(symbols: string[]) {
  return Array.from(
    new Set(
      symbols
        .map((symbol) => symbol.trim().toUpperCase())
        .filter(Boolean)
    )
  );
}

export async function loadUsTurnoverSymbols(): Promise<string[]> {
  const db = getDb();
  if (!db) return ["AAPL", "TSLA", "NVDA"];
  const canonical = await db.select({ code: usInstruments.code }).from(usTurnoverWatchlist)
    .innerJoin(usInstruments, eq(usInstruments.id, usTurnoverWatchlist.instrumentId))
    .where(eq(usTurnoverWatchlist.enabled, true)).orderBy(asc(usInstruments.code));
  if (canonical.length > 0) return normalizeSymbols(canonical.map((row) => row.code));
  const rows = await db.select().from(usTurnoverSymbols).where(eq(usTurnoverSymbols.key, STORAGE_KEY)).limit(1);
  const raw = (rows[0]?.symbols as string[] | undefined) ?? ["AAPL", "TSLA", "NVDA"];
  return normalizeSymbols(raw);
}

export async function saveUsTurnoverSymbols(symbols: string[]) {
  const db = getDb();
  if (!db) throw new Error("Database connection is not available.");
  const normalized = normalizeSymbols(symbols);
  const instruments = [] as number[];
  for (const code of normalized) {
    const id = await ensureUsInstrument({ market: "AMS", code });
    if (id !== null) instruments.push(id);
  }
  if (instruments.length > 0) {
    await db.insert(usTurnoverWatchlist).values(instruments.map((instrumentId) => ({ instrumentId, enabled: true, updatedAt: new Date() })))
      .onConflictDoUpdate({ target: usTurnoverWatchlist.instrumentId, set: { enabled: true, updatedAt: new Date() } });
    await db.update(usTurnoverWatchlist).set({ enabled: false, updatedAt: new Date() })
      .where(inArray(usTurnoverWatchlist.instrumentId, (await db.select({ id: usTurnoverWatchlist.instrumentId }).from(usTurnoverWatchlist)).map((r) => r.id).filter((id) => !instruments.includes(id))));
  }
  await db.insert(usTurnoverSymbols).values({
    key: STORAGE_KEY,
    symbols: normalized,
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: usTurnoverSymbols.key,
    set: { symbols: normalized, updatedAt: new Date() },
  });
  return normalized;
}
