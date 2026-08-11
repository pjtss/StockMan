import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { usInstruments } from "@/lib/schema";
import { classifyUsInstrumentProduct, isEligibleUsCommonStock } from "@/lib/us-instrument-product";

/** Resolves or creates the canonical instrument row used by every US feature. */
export async function ensureUsInstrument(input: { market: string; code: string; name?: string; englishName?: string; productType?: string; instrumentType?: string }) {
  const db = getDb();
  if (!db) return null;
  const market = input.market.trim().toUpperCase();
  const code = input.code.trim().toUpperCase();
  if (!market || !code) return null;
  // A ticker-only insert cannot prove that the product is a common stock.
  // Existing canonical rows remain resolvable, but new rows require provider
  // metadata or a name so ETF/leveraged products cannot enter by accident.
  const existing = await db.select({ id: usInstruments.id, enabled: usInstruments.enabled, productStatus: usInstruments.productStatus })
    .from(usInstruments).where(and(eq(usInstruments.market, market), eq(usInstruments.code, code))).limit(1);
  if (!input.name?.trim() && !input.englishName?.trim() && !input.productType?.trim() && !input.instrumentType?.trim()) return existing[0]?.productStatus === "ACTIVE" && existing[0]?.enabled ? existing[0].id : null;
  const product = classifyUsInstrumentProduct({ name: input.name, englishName: input.englishName, type: input.productType ?? input.instrumentType });
  if (!isEligibleUsCommonStock(product)) return null;
  const values = { market, code, name: input.name?.trim() ?? "", instrumentType: product.instrumentType, isEtf: product.isEtf, isLeveraged: product.isLeveraged, isInverse: product.isInverse, isDerivativeProduct: product.isDerivativeProduct, classificationSource: product.source, classificationConfidence: product.confidence };
  const [row] = await db.insert(usInstruments).values(values)
    .onConflictDoUpdate({ target: [usInstruments.market, usInstruments.code], set: { ...values, updatedAt: new Date() } })
    .returning({ id: usInstruments.id });
  return row?.id ?? null;
}
