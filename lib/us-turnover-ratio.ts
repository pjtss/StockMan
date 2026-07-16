import { fetchKisUsTopRisingApi, type KisUsTopRisingApiRequest } from "@/lib/kis-us-api";
import { fetchKisUsPriceDetail, getKisUsPriceDetailOutput } from "@/lib/kis-us-price-detail";
import { loadUsTurnoverBlacklist } from "@/lib/us-turnover-blacklist";

export type UsTurnoverRatioItem = {
  market: string;
  rank: number;
  code: string;
  name: string;
  price: string;
  changeRate: string;
  marketCap: number;
  tradingValue: number;
  turnoverRatio: number;
};

export type UsTurnoverRatioDebug = {
  sourceCount: number;
  preDetailFilteredOutCount?: number;
  priceDetailAttemptCount: number;
  priceDetailSuccessCount: number;
  details: Array<{
    code: string;
    marketCap: number | null;
    tradingValue: number | null;
    turnoverRatio: number | null;
    included: boolean;
  }>;
};

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(String(value ?? "").replace(/,/g, "").replace(/%/g, "").trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function signedNumber(value: unknown): number | null {
  const parsed = Number(String(value ?? "").replace(/,/g, "").replace(/%/g, "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePrice(value: unknown) {
  const parsed = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function firstNumber(item: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = numberValue(item[key]);
    if (value !== null) return value;
  }
  return null;
}

function isInverseOrLeveraged(item: Record<string, unknown>) {
  const name = String(item.name ?? "");
  const englishName = String(item.ename ?? item.enName ?? "");
  return /인버스|레버리지|inverse|leverag|\bshort\b|\b\d+(?:\.\d+)?x\b/i.test(`${name} ${englishName}`);
}

async function enrichWithPriceDetails(output: unknown[], market: string) {
  const result: unknown[] = Array.from({ length: output.length });
  const debug: UsTurnoverRatioDebug = { sourceCount: output.length, priceDetailAttemptCount: 0, priceDetailSuccessCount: 0, details: [] };
  const concurrency = 8;
  let nextIndex = 0;
  async function worker() {
    while (true) {
      const index = nextIndex++;
      if (index >= output.length) return;
      const raw = output[index];
      if (!raw || typeof raw !== "object") continue;
      const item = raw as Record<string, unknown>;
      const code = String(item.symb ?? item.rsym ?? item.code ?? "").trim();
      if (!code) {
        result[index] = item;
        continue;
      }
      debug.priceDetailAttemptCount += 1;
      const detail = await fetchKisUsPriceDetail({ code, market });
      if (detail?.ok) debug.priceDetailSuccessCount += 1;
      const outputDetail = getKisUsPriceDetailOutput(detail?.parsed);
      const detailMarketCap = firstNumber(outputDetail, ["tomv", "mcap"]);
      const detailTradingValue = firstNumber(outputDetail, ["tamt", "tamnt"]);
      result[index] = {
        ...item,
        ...outputDetail,
        symb: item.symb ?? code,
        __priceDetailMarketCap: detailMarketCap,
        __priceDetailTradingValue: detailTradingValue,
      };
      const marketCap = detailMarketCap;
      const tradingValue = detailTradingValue;
      const turnoverRatio = marketCap !== null && tradingValue !== null ? (tradingValue / marketCap) * 100 : null;
      debug.details[index] = { code, marketCap, tradingValue, turnoverRatio, included: turnoverRatio !== null && turnoverRatio >= 1 && turnoverRatio <= 10 };
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, output.length) }, () => worker()));
  debug.details = debug.details.filter(Boolean);
  return { output: result, debug };
}

export function filterUsTurnoverRatioItems(parsed: unknown, limit = 100): UsTurnoverRatioItem[] {
  const response = parsed as { output?: unknown; output1?: unknown; output2?: unknown };
  const output = response?.output ?? response?.output2 ?? response?.output1;
  if (!Array.isArray(output)) return [];

  return output.flatMap((raw, index) => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Record<string, unknown>;
    if (isInverseOrLeveraged(item)) return [];
    const changeRate = signedNumber(item.rate ?? item.changeRate ?? item.n_rate);
    if (changeRate === null || changeRate < 0) return [];
    const marketCap = numberValue(item.__priceDetailMarketCap);
    const tradingValue = numberValue(item.__priceDetailTradingValue);
    if (marketCap === null || tradingValue === null) return [];
    if (marketCap < 1_000_000 || marketCap > 100_000_000) return [];

    const turnoverRatio = (tradingValue / marketCap) * 100;
    if (turnoverRatio < 1 || turnoverRatio > 10) return [];

    return [{
      market: String(item.__market ?? item.excd ?? "AMS"),
      rank: Number(item.rank ?? item.rnum ?? index + 1),
      code: String(item.symb ?? item.rsym ?? item.code ?? ""),
      name: String(item.name ?? item.company ?? item.enName ?? ""),
      price: String(item.last ?? item.price ?? ""),
      changeRate: String(item.rate ?? item.changeRate ?? item.n_rate ?? ""),
      marketCap,
      tradingValue,
      turnoverRatio,
    }];
  }).slice(0, limit);
}

export async function fetchUsTurnoverRatioScanner(request: KisUsTopRisingApiRequest = {}, markets = [request.excd || "AMS"]) {
  const results = await Promise.all(markets.map(async (market) => {
    const result = await fetchKisUsTopRisingApi({ ...request, excd: market });
    if (!result) return null;
    const parsed = result.response.parsed as { output?: unknown; output1?: unknown; output2?: unknown };
    const source = parsed?.output ?? parsed?.output2 ?? parsed?.output1;
    const output = Array.isArray(source) ? source.slice(0, 100) : [];
    const detailEligibleOutput = output.filter((item) => {
      if (!item || typeof item !== "object") return false;
      const row = item as Record<string, unknown>;
      const price = parsePrice(row.last ?? row.price);
      const rate = signedNumber(row.rate ?? row.changeRate ?? row.n_rate);
      return price !== null && price < 10 && rate !== null && rate < 20;
    });
    const enriched = await enrichWithPriceDetails(detailEligibleOutput, market);
    enriched.debug.sourceCount = output.length;
    enriched.debug.preDetailFilteredOutCount = output.length - detailEligibleOutput.length;
    return { result, enriched };
  }));
  const validResults = results.filter((value): value is NonNullable<typeof value> => value !== null);
  if (validResults.length === 0) return null;
  const blacklist = new Set(await loadUsTurnoverBlacklist());
  const filteredOutput = validResults.flatMap(({ enriched }) => enriched.output.map((rawItem) => {
    const item = rawItem as Record<string, unknown>;
    return {
    ...item,
    __market: item.excd,
    };
  })).filter((item) => {
    const code = String((item as Record<string, unknown>)?.symb ?? "").toUpperCase();
    return !blacklist.has(code);
  });
  const first = validResults[0].result;
  const debug = validResults.reduce((acc, value) => ({
    sourceCount: acc.sourceCount + value.enriched.debug.sourceCount,
    preDetailFilteredOutCount: (acc.preDetailFilteredOutCount || 0) + (value.enriched.debug.preDetailFilteredOutCount || 0),
    priceDetailAttemptCount: acc.priceDetailAttemptCount + value.enriched.debug.priceDetailAttemptCount,
    priceDetailSuccessCount: acc.priceDetailSuccessCount + value.enriched.debug.priceDetailSuccessCount,
    details: [...acc.details, ...value.enriched.debug.details],
  }), { sourceCount: 0, preDetailFilteredOutCount: 0, priceDetailAttemptCount: 0, priceDetailSuccessCount: 0, details: [] as Array<{ code: string; marketCap: number | null; tradingValue: number | null; turnoverRatio: number | null; included: boolean }> });
  return {
    ...first,
    filtered: filterUsTurnoverRatioItems({ output: filteredOutput }, 100),
    debug,
  };
}
