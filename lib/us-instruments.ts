import { getDb } from "@/lib/db";
import { usInstruments } from "@/lib/schema";

/** Resolves or creates the canonical instrument row used by every US feature. */
export async function ensureUsInstrument(input: { market: string; code: string; name?: string; instrumentType?: string }) {
  const db = getDb();
  if (!db) return null;
  const market = input.market.trim().toUpperCase();
  const code = input.code.trim().toUpperCase();
  if (!market || !code) return null;
  const [row] = await db.insert(usInstruments).values({ market, code, name: input.name?.trim() ?? "", instrumentType: input.instrumentType ?? "COMMON_STOCK" })
    .onConflictDoUpdate({ target: [usInstruments.market, usInstruments.code], set: { name: input.name?.trim() ?? "", instrumentType: input.instrumentType ?? "COMMON_STOCK", updatedAt: new Date() } })
    .returning({ id: usInstruments.id });
  return row?.id ?? null;
}
