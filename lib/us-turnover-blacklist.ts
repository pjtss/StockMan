import { asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { usTurnoverRatioBlacklist } from "@/lib/schema";
import { ensureUsInstrument } from "@/lib/us-daily-breakout-watchlist";

export function normalizeUsTicker(value: unknown) {
  return String(value ?? "").trim().toUpperCase();
}

export async function loadUsTurnoverBlacklist() {
  const db = getDb();
  if (!db) return [];
  const rows = await db.select().from(usTurnoverRatioBlacklist).orderBy(asc(usTurnoverRatioBlacklist.ticker));
  return rows.map((row) => row.ticker);
}

export async function addUsTurnoverBlacklistTicker(value: unknown) {
  const ticker = normalizeUsTicker(value);
  if (!/^[A-Z0-9.-]+$/.test(ticker)) throw new Error("티커는 영문, 숫자, ., -만 사용할 수 있습니다.");
  const db = getDb();
  if (!db) throw new Error("Database connection is not available.");
  // Legacy blacklist rows are ticker-only. Resolve the canonical instrument
  // whenever the exchange is known; the ticker remains for backward compatibility.
  const instrument = await ensureUsInstrument({ market: "NAS", code: ticker });
  await db.insert(usTurnoverRatioBlacklist).values({ ticker, instrumentId: instrument ?? undefined }).onConflictDoUpdate({
    target: usTurnoverRatioBlacklist.ticker,
    set: { instrumentId: instrument ?? undefined },
  });
  return ticker;
}

export async function removeUsTurnoverBlacklistTicker(value: unknown) {
  const ticker = normalizeUsTicker(value);
  const db = getDb();
  if (!db) throw new Error("Database connection is not available.");
  await db.delete(usTurnoverRatioBlacklist).where(eq(usTurnoverRatioBlacklist.ticker, ticker));
}
