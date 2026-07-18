import { fetchKisUsPriceDetail, getKisUsPriceDetailOutput } from "@/lib/kis-us-price-detail";
import { calculateKisUsMarketCap } from "@/lib/kis-us-market-cap";
import { listUsTurnoverWatches } from "@/lib/us-turnover-watch-repository";

const MARKETS = ["NAS", "AMS", "NYS"];

export async function testUsTurnoverWatch() {
  const watches = await listUsTurnoverWatches();
  const results = [];
  for (const watch of watches) {
    for (const market of MARKETS) {
      const response = await fetchKisUsPriceDetail({ code: watch.ticker, market });
      const output = getKisUsPriceDetailOutput(response?.parsed);
      const marketCap = calculateKisUsMarketCap(output);
      const tradingValue = Number(String(output.tamt ?? output.tamnt ?? "").replace(/,/g, ""));
      const turnoverRatio = marketCap !== null && Number.isFinite(tradingValue) ? (tradingValue / marketCap) * 100 : null;
      results.push({ ticker: watch.ticker, market, threshold: watch.threshold, ok: response?.ok ?? false, status: response?.status ?? null, marketCap, tradingValue: Number.isFinite(tradingValue) ? tradingValue : null, turnoverRatio, meetsThreshold: turnoverRatio !== null && turnoverRatio >= watch.threshold, rawResponse: response?.parsed ?? null });
    }
  }
  return { watches, results };
}
