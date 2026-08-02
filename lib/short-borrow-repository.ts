import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { shortBorrowSnapshots } from "@/lib/schema";
import type { ShortBorrowResult } from "@/lib/alpaca-short-borrow";
import { ensureUsInstrument } from "@/lib/us-daily-breakout-watchlist";

export async function loadPreviousShortBorrow(symbol: string) {
  const db = getDb();
  const rows = await db.select().from(shortBorrowSnapshots).where(eq(shortBorrowSnapshots.symbol, symbol)).orderBy(desc(shortBorrowSnapshots.fetchedAt)).limit(1);
  return rows[0] || null;
}

export async function saveShortBorrowSnapshot(result: ShortBorrowResult) {
  const db = getDb();
  const instrumentId = await ensureUsInstrument({ market: "NAS", code: result.symbol });
  await db.insert(shortBorrowSnapshots).values({
    symbol: result.symbol,
    instrumentId: instrumentId ?? undefined,
    tradable: result.tradable,
    shortable: result.shortable,
    borrowStatus: result.borrowStatus,
    quoteStatus: result.quoteStatus,
    availableQty: result.availableQty,
    locatePricePerShare: result.locatePricePerShare,
    currentPrice: result.currentPrice,
    locateFeeRatePercent: result.locateFeeRatePercent,
    pressureScore: result.pressureScore,
    pressureLevel: result.pressureLevel,
    quotedAt: result.quotedAt ? new Date(result.quotedAt) : null,
    fetchedAt: new Date(result.fetchedAt),
  });
  return result;
}
