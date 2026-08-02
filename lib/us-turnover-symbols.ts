import { getDb } from "./db";
import { usInstruments, usTurnoverWatchlist } from "./schema";
import { ensureUsInstrument } from "./us-instruments";
import { asc, eq } from "drizzle-orm";

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
  return normalizeSymbols(canonical.map((row) => row.code));
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
  }
  const current = await db.select({ id: usTurnoverWatchlist.instrumentId }).from(usTurnoverWatchlist);
  for (const row of current) {
    if (!instruments.includes(row.id)) {
      await db.update(usTurnoverWatchlist).set({ enabled: false, updatedAt: new Date() })
        .where(eq(usTurnoverWatchlist.instrumentId, row.id));
    }
  }
  return normalized;
}
