import { getDb } from "./db";
import { usInstruments, usTurnoverWatchlist } from "./schema";
import { ensureUsInstrument } from "./us-instruments";
import { and, asc, eq, or } from "drizzle-orm";

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
    .where(and(eq(usTurnoverWatchlist.enabled, true), or(eq(usInstruments.manualProductAction, "ALLOW"), and(eq(usInstruments.isEtf, false), eq(usInstruments.isLeveraged, false), eq(usInstruments.isInverse, false), eq(usInstruments.isDerivativeProduct, false), eq(usInstruments.instrumentType, "COMMON_STOCK"))))).orderBy(asc(usInstruments.code));
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

export async function addUsTurnoverSymbol(symbol: string) {
  const db = getDb();
  if (!db) throw new Error("Database connection is not available.");
  const code = normalizeSymbols([symbol])[0];
  if (!code) throw new Error("티커가 필요합니다.");
  const id = await ensureUsInstrument({ market: "AMS", code });
  if (id === null) throw new Error("티커 등록에 실패했습니다.");
  await db.insert(usTurnoverWatchlist).values({ instrumentId: id, enabled: true, updatedAt: new Date() })
    .onConflictDoUpdate({ target: usTurnoverWatchlist.instrumentId, set: { enabled: true, updatedAt: new Date() } });
  return code;
}

export async function removeUsTurnoverSymbol(symbol: string) {
  const db = getDb();
  if (!db) throw new Error("Database connection is not available.");
  const code = normalizeSymbols([symbol])[0];
  if (!code) throw new Error("티커가 필요합니다.");
  const rows = await db.select({ id: usInstruments.id }).from(usInstruments).where(eq(usInstruments.code, code));
  for (const row of rows) await db.update(usTurnoverWatchlist).set({ enabled: false, updatedAt: new Date() }).where(eq(usTurnoverWatchlist.instrumentId, row.id));
  return code;
}

export async function clearUsTurnoverSymbols() {
  const db = getDb();
  if (!db) throw new Error("Database connection is not available.");
  await db.update(usTurnoverWatchlist).set({ enabled: false, updatedAt: new Date() });
}
