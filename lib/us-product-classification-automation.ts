import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { usInstruments } from "@/lib/schema";
import { fetchKisUsPriceDetail, getKisUsPriceDetailOutput } from "@/lib/kis-us-price-detail";
import { classifyUsInstrumentProduct } from "@/lib/us-instrument-product";

const MARKETS = ["NAS", "NYS", "AMS"] as const;

function text(output: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = String(output[key] ?? "").trim();
    if (value) return value;
  }
  return "";
}

export async function refreshUsProductClassifications(options: { concurrency?: number } = {}) {
  const db = getDb();
  const rows = await db.select({ id: usInstruments.id, market: usInstruments.market, code: usInstruments.code, name: usInstruments.name, enabled: usInstruments.enabled })
    .from(usInstruments).where(and(eq(usInstruments.enabled, true), inArray(usInstruments.market, [...MARKETS])))
    .orderBy(asc(usInstruments.market), asc(usInstruments.code));
  const concurrency = Math.max(1, Math.min(Math.floor(options.concurrency ?? 4), 8));
  const results: Array<Record<string, unknown>> = [];
  let cursor = 0;
  async function worker() {
    while (true) {
      const row = rows[cursor++];
      if (!row) return;
      try {
        const response = await fetchKisUsPriceDetail({ market: row.market, code: row.code });
        const output = getKisUsPriceDetailOutput(response?.parsed);
        if (!response?.ok) {
          results.push({ market: row.market, code: row.code, ok: false, status: response?.status ?? 0, action: "UNCHANGED", reason: "KIS_ERROR" });
          continue;
        }
        const productType = text(output, "etyp_nm", "product_type", "instrument_type");
        const providerName = text(output, "ename", "name", "company_name");
        const product = classifyUsInstrumentProduct({ name: row.name, englishName: providerName, type: productType, market: row.market });
        const hasPositiveExclusion = product.isEtf || product.isLeveraged || product.isInverse || product.isDerivativeProduct || product.instrumentType !== "COMMON_STOCK";
        const reason = hasPositiveExclusion ? `KIS product classification: ${product.instrumentType}` : (productType ? "KIS common-stock classification" : "KIS product type unavailable; existing state retained");
        const checkedAt = new Date();
        if (hasPositiveExclusion) {
          await db.update(usInstruments).set({ enabled: false, productStatus: "INACTIVE_EXCLUDED", instrumentType: product.instrumentType, isEtf: product.isEtf, isLeveraged: product.isLeveraged, isInverse: product.isInverse, isDerivativeProduct: product.isDerivativeProduct, classificationSource: "KIS_PRICE_DETAIL", classificationConfidence: product.confidence, classificationCheckedAt: checkedAt, classificationReason: reason, updatedAt: checkedAt }).where(eq(usInstruments.id, row.id));
          results.push({ market: row.market, code: row.code, ok: true, action: "INACTIVE_EXCLUDED", instrumentType: product.instrumentType, productType, reason });
        } else {
          await db.update(usInstruments).set({ classificationSource: productType ? "KIS_PRICE_DETAIL" : row.name ? "NAME_FALLBACK" : "KIS_UNKNOWN", classificationConfidence: productType ? 0.95 : product.confidence, classificationCheckedAt: checkedAt, classificationReason: reason, updatedAt: checkedAt }).where(eq(usInstruments.id, row.id));
          results.push({ market: row.market, code: row.code, ok: true, action: "ACTIVE_UNCHANGED", instrumentType: product.instrumentType, productType, reason });
        }
      } catch (error) {
        results.push({ market: row.market, code: row.code, ok: false, action: "UNCHANGED", reason: error instanceof Error ? error.message : String(error) });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, rows.length)) }, worker));
  return {
    ok: true,
    source: "KIS_PRICE_DETAIL",
    instrumentCount: rows.length,
    successCount: results.filter((item) => item.ok === true).length,
    failureCount: results.filter((item) => item.ok !== true).length,
    deactivatedCount: results.filter((item) => item.action === "INACTIVE_EXCLUDED").length,
    unchangedCount: results.filter((item) => item.action === "ACTIVE_UNCHANGED" || item.action === "UNCHANGED").length,
    results,
  };
}
