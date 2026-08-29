import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { instrumentFundamentalSnapshots, krCommonStockUniverse, usCommonStockUniverse } from "@/lib/schema";
import { fetchKrPriceDetail } from "@/lib/kis-kr-price-detail";
import { fetchKisUsPriceDetail, getKisUsPriceDetailOutput } from "@/lib/kis-us-price-detail";
import { withAutomationLock } from "@/lib/automation-lock";

const n = (v: unknown) => { const x = Number(String(v ?? "").replace(/,/g, "")); return Number.isFinite(x) ? x : null; };
async function executeInstrumentFundamentalsRefresh() {
  const db = getDb(); const startedAt = new Date();
  const [kr, us] = await Promise.all([
    db.select({ market: krCommonStockUniverse.market, code: krCommonStockUniverse.code, name: krCommonStockUniverse.name }).from(krCommonStockUniverse).where(sql`${krCommonStockUniverse.enabled} = true`),
    db.select({ market: usCommonStockUniverse.market, code: usCommonStockUniverse.code, name: usCommonStockUniverse.name }).from(usCommonStockUniverse).where(sql`${usCommonStockUniverse.enabled} = true`),
  ]);
  const instruments = [...kr, ...us]; const failures: Array<{ market: string; code: string; error: string }> = []; let successCount = 0;
  const fetchedRows: any[] = [];
  let cursor = 0;
  const fetchWorker = async () => { while (true) {
      const item = instruments[cursor++]; if (!item) return;
      try {
        let data: any; let source: string;
        if (item.market === "KOSPI" || item.market === "KOSDAQ" || item.market === "KRX") { data = await fetchKrPriceDetail(item.code); source = "KIS_DOMESTIC_PRICE"; }
        else { const response = await fetchKisUsPriceDetail({ code: item.code, market: item.market }); const output = getKisUsPriceDetailOutput(response?.parsed); data = { ok: response?.ok, status: response?.status, price: n(output.last ?? output.t_prpr ?? output.price), changeRate: n(output.t_xrat ?? output.prdy_ctrt), volume: n(output.tvol ?? output.pvol ?? output.vol), tradingValue: n(output.tamt ?? output.tamnt), marketCap: n(output.tomv), sharesOutstanding: n(output.shar ?? output.shares ?? output.lstn_stcn), currency: String(output.crcy ?? output.currency ?? "USD"), exchange: String(output.excd ?? output.exchange ?? item.market), raw: response?.parsed ?? {} }; source = "KIS_OVERSEAS_PRICE"; }
        if (!data?.ok) throw new Error(`KIS HTTP ${data?.status ?? "unknown"}`);
        fetchedRows.push({ market: item.market, code: item.code, name: item.name, price: data.price, changeRate: data.changeRate, open: data.open ?? null, high: data.high ?? null, low: data.low ?? null, volume: data.volume, tradingValue: data.tradingValue, marketCap: data.marketCap, sharesOutstanding: data.sharesOutstanding ?? null, currency: data.currency ?? (item.market === "KOSPI" || item.market === "KOSDAQ" || item.market === "KRX" ? "KRW" : "USD"), source, rawPayload: JSON.stringify(data.raw ?? data.parsed ?? data) });
      } catch (error) { failures.push({ market: item.market, code: item.code, error: error instanceof Error ? error.message : String(error) }); }
  } };
  await Promise.all(Array.from({ length: Math.min(8, Math.max(1, instruments.length)) }, fetchWorker));
  for (let i = 0; i < fetchedRows.length; i += 200) {
    const batch = fetchedRows.slice(i, i + 200); const now = new Date();
    await db.insert(instrumentFundamentalSnapshots).values(batch.map((row) => ({ ...row, observedAt: now, fetchedAt: now }))).onConflictDoUpdate({ target: [instrumentFundamentalSnapshots.market, instrumentFundamentalSnapshots.code], set: { name: sql`excluded.name`, price: sql`excluded.price`, changeRate: sql`excluded.change_rate`, volume: sql`excluded.volume`, tradingValue: sql`excluded.trading_value`, marketCap: sql`excluded.market_cap`, sharesOutstanding: sql`excluded.shares_outstanding`, currency: sql`excluded.currency`, source: sql`excluded.source`, rawPayload: sql`excluded.raw_payload`, observedAt: now, fetchedAt: now } });
    successCount += batch.length;
  }
  return { ok: failures.length === 0, startedAt: startedAt.toISOString(), completedAt: new Date().toISOString(), instrumentCount: instruments.length, successCount, failureCount: failures.length, failures: failures.slice(0, 100) };
}

export function refreshInstrumentFundamentals() {
  return withAutomationLock("instrument-fundamentals-refresh", async () => executeInstrumentFundamentalsRefresh());
}
