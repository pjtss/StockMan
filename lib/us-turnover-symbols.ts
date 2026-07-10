import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { usTurnoverSymbols } from "./schema";

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
  const rows = await db.select().from(usTurnoverSymbols).where(eq(usTurnoverSymbols.key, STORAGE_KEY)).limit(1);
  const raw = (rows[0]?.symbols as string[] | undefined) ?? ["AAPL", "TSLA", "NVDA"];
  return normalizeSymbols(raw);
}

export async function saveUsTurnoverSymbols(symbols: string[]) {
  const db = getDb();
  if (!db) throw new Error("Database connection is not available.");
  const normalized = normalizeSymbols(symbols);
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
