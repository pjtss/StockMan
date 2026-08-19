import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { instrumentFundamentalSnapshots, krInstrumentUniverse, usInstrumentUniverse } from "@/lib/schema";
import { fetchKrPriceDetail } from "@/lib/kis-kr-price-detail";
import { fetchKisUsPriceDetail, getKisUsPriceDetailOutput } from "@/lib/kis-us-price-detail";

const n = (v: unknown) => { const x = Number(String(v ?? "").replace(/,/g, "")); return Number.isFinite(x) ? x : null; };
export async function refreshInstrumentFundamentals() {
  const db = getDb(); const startedAt = new Date();
  const [kr, us] = await Promise.all([
    db.select({ market: krInstrumentUniverse.market, code: krInstrumentUniverse.code, name: krInstrumentUniverse.name }).from(krInstrumentUniverse).where(sql`${krInstrumentUniverse.enabled} = true`),
    db.select({ market: usInstrumentUniverse.market, code: usInstrumentUniverse.code, name: usInstrumentUniverse.name }).from(usInstrumentUniverse).where(sql`${usInstrumentUniverse.enabled} = true`),
  ]);
  const instruments = [...kr, ...us]; const failures: Array<{ market: string; code: string; error: string }> = []; let successCount = 0;
  for (let i = 0; i < instruments.length; i += 4) {
    await Promise.all(instruments.slice(i, i + 4).map(async (item) => {
      try {
        let data: any; let source: string;
        if (item.market === "KOSPI" || item.market === "KOSDAQ" || item.market === "KRX") { data = await fetchKrPriceDetail(item.code); source = "KIS_DOMESTIC_PRICE"; }
        else { const response = await fetchKisUsPriceDetail({ code: item.code, market: item.market }); const output = getKisUsPriceDetailOutput(response?.parsed); data = { ok: response?.ok, status: response?.status, price: n(output.last ?? output.t_prpr ?? output.price), changeRate: n(output.t_xrat ?? output.prdy_ctrt), volume: n(output.tvol ?? output.pvol ?? output.vol), tradingValue: n(output.tamt ?? output.tamnt), marketCap: n(output.tomv), raw: response?.parsed ?? {} }; source = "KIS_OVERSEAS_PRICE"; }
        if (!data?.ok) throw new Error(`KIS HTTP ${data?.status ?? "unknown"}`);
        await db.insert(instrumentFundamentalSnapshots).values({ market: item.market, code: item.code, name: item.name, price: data.price, changeRate: data.changeRate, open: data.open ?? null, high: data.high ?? null, low: data.low ?? null, volume: data.volume, tradingValue: data.tradingValue, marketCap: data.marketCap, source, rawPayload: JSON.stringify(data.raw ?? data.parsed ?? data) }).onConflictDoUpdate({ target: [instrumentFundamentalSnapshots.market, instrumentFundamentalSnapshots.code], set: { name: item.name, price: data.price, changeRate: data.changeRate, volume: data.volume, tradingValue: data.tradingValue, marketCap: data.marketCap, source, rawPayload: JSON.stringify(data.raw ?? data.parsed ?? data), observedAt: new Date(), fetchedAt: new Date() } }); successCount++;
      } catch (error) { failures.push({ market: item.market, code: item.code, error: error instanceof Error ? error.message : String(error) }); }
    }));
  }
  return { ok: failures.length === 0, startedAt: startedAt.toISOString(), completedAt: new Date().toISOString(), instrumentCount: instruments.length, successCount, failureCount: failures.length, failures: failures.slice(0, 100) };
}
