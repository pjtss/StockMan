import { getDb } from "@/lib/db";
import { usInstruments } from "@/lib/schema";
import { classifyUsInstrumentProduct } from "@/lib/us-instrument-product";

/** Resolves or creates the canonical instrument row used by every US feature. */
export async function ensureUsInstrument(input: { market: string; code: string; name?: string; englishName?: string; productType?: string; instrumentType?: string }) {
  const db = getDb();
  if (!db) return null;
  const market = input.market.trim().toUpperCase();
  const code = input.code.trim().toUpperCase();
  if (!market || !code) return null;
  const product = classifyUsInstrumentProduct({ name: input.name, englishName: input.englishName, type: input.productType ?? input.instrumentType });
  const values = { market, code, name: input.name?.trim() ?? "", instrumentType: product.instrumentType, isEtf: product.isEtf, isLeveraged: product.isLeveraged, isInverse: product.isInverse, isDerivativeProduct: product.isDerivativeProduct, classificationSource: product.source, classificationConfidence: product.confidence };
  const [row] = await db.insert(usInstruments).values(values)
    .onConflictDoUpdate({ target: [usInstruments.market, usInstruments.code], set: { ...values, updatedAt: new Date() } })
    .returning({ id: usInstruments.id });
  return row?.id ?? null;
}
