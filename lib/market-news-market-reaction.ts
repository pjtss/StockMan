import { fetchKisUsPriceDetail, getKisUsPriceDetailOutput } from "./kis-us-price-detail";
import { extractSecCik } from "./sec-company-ticker";

export type SecTickerMapping = { cik: string; ticker: string; exchange: string };
export type MarketNewsReaction = { cik: string; ticker: string; exchange: string; market: string; ok: boolean; status?: number; last?: number; rate?: number; volume?: number; tradingValue?: number; marketCap?: number; error?: string };

export function kisMarketFromSecExchange(exchange: string) {
  const normalized = exchange.toUpperCase();
  if (normalized.includes("NASDAQ")) return "NAS";
  if (normalized.includes("AMEX") || normalized.includes("NYSE AMERICAN")) return "AMS";
  if (normalized.includes("NYSE")) return "NYS";
  return "";
}

function numberValue(value: unknown) {
  const parsed = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function resolveMarketNewsReactions(items: Array<{ title: string }>, mappings: SecTickerMapping[], limit = 5) {
  const results: MarketNewsReaction[] = [];
  const seen = new Set<string>();
  for (const item of items.slice(0, limit)) {
    const cik = extractSecCik(item.title);
    const mapping = mappings.find((row) => row.cik === cik);
    if (!mapping || seen.has(mapping.ticker)) continue;
    seen.add(mapping.ticker);
    const market = kisMarketFromSecExchange(mapping.exchange);
    if (!market) { results.push({ cik, ticker: mapping.ticker, exchange: mapping.exchange, market: "", ok: false, error: "unsupported_exchange" }); continue; }
    try {
      const response = await fetchKisUsPriceDetail({ code: mapping.ticker, market });
      if (!response) { results.push({ cik, ticker: mapping.ticker, exchange: mapping.exchange, market, ok: false, error: "kis_response_missing" }); continue; }
      const output = getKisUsPriceDetailOutput(response.parsed) as Record<string, unknown>;
      results.push({ cik, ticker: mapping.ticker, exchange: mapping.exchange, market, ok: response.ok, status: response.status, last: numberValue(output.last || output.stck_prpr || output.price), rate: numberValue(output.rate || output.prdy_ctrt || output.changeRate), volume: numberValue(output.tvol || output.volume), tradingValue: numberValue(output.tot_tr_pbmn || output.tradingValue), marketCap: numberValue(output.hts_avls || output.marketCap), error: response.ok ? undefined : `kis_http_${response.status}` });
    } catch (error) { results.push({ cik, ticker: mapping.ticker, exchange: mapping.exchange, market, ok: false, error: error instanceof Error ? error.message : String(error) }); }
  }
  return results;
}
