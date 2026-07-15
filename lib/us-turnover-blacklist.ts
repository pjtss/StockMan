import { asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { usTurnoverRatioBlacklist } from "@/lib/schema";

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
  await db.insert(usTurnoverRatioBlacklist).values({ ticker }).onConflictDoNothing();
  return ticker;
}

export async function removeUsTurnoverBlacklistTicker(value: unknown) {
  const ticker = normalizeUsTicker(value);
  const db = getDb();
  if (!db) throw new Error("Database connection is not available.");
  await db.delete(usTurnoverRatioBlacklist).where(eq(usTurnoverRatioBlacklist.ticker, ticker));
}
