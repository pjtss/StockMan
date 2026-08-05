import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { usInstruments } from "@/lib/schema";
import { ensureUsInstrument } from "@/lib/us-instruments";
import { fetchKisUsTopRisingApi } from "@/lib/kis-us-api";

export const US_EXCHANGES = ["NAS", "AMS", "NYS"] as const;
const EXCLUDED = /ETF|ETN|인버스|레버리지|inverse|leverag|\bshort\b|\b\d+(?:\.\d+)?x\b/i;
function rows(parsed: any) { const output = parsed?.output ?? parsed?.output2 ?? parsed?.output1; return Array.isArray(output) ? output.slice(0, 100) : []; }
function code(row: any) { return String(row.symb ?? row.rsym ?? row.code ?? "").replace(/^D[A-Z]{3}/, "").trim().toUpperCase(); }

export async function upsertUsTopRisingUniverse() {
  const db = getDb(); const results: any[] = []; const seen = new Set<string>();
  for (const market of US_EXCHANGES) {
    const response = await fetchKisUsTopRisingApi({ excd: market });
    const sourceRows = rows(response?.response?.parsed); let upserted = 0; let excluded = 0;
    for (const row of sourceRows) {
      const ticker = code(row); const name = String(row.name ?? row.company ?? row.enName ?? "").trim();
      if (!ticker) continue;
      const isExcluded = EXCLUDED.test(`${name} ${String(row.ename ?? "")}`) || /ETF|ETN/i.test(String(row.etyp_nm ?? ""));
      if (isExcluded) { excluded += 1; continue; }
      if (seen.has(`${market}:${ticker}`)) continue; seen.add(`${market}:${ticker}`);
      if (await ensureUsInstrument({ market, code: ticker, name, instrumentType: "COMMON_STOCK" })) upserted += 1;
    }
    results.push({ market, httpStatus: response?.status ?? 0, sourceCount: sourceRows.length, upsertedCount: upserted, excludedCount: excluded, rawTextPreview: response?.response?.rawText?.slice(0, 500) ?? "" });
  }
  const activeCount = db ? (await db.select({ id: usInstruments.id }).from(usInstruments).where(and(eq(usInstruments.enabled, true), inArray(usInstruments.market, [...US_EXCHANGES])))).length : 0;
  return { ok: results.every((row) => row.httpStatus >= 200 && row.httpStatus < 300), checkedAt: new Date().toISOString(), exchanges: [...US_EXCHANGES], results, activeInstrumentCount: activeCount };
}
