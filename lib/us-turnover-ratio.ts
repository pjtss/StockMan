import { fetchKisUsTopRisingApi, type KisUsTopRisingApiRequest } from "@/lib/kis-us-api";
import { fetchKisUsPriceDetail, getKisUsPriceDetailOutput } from "@/lib/kis-us-price-detail";
import { loadUsTurnoverBlacklist } from "@/lib/us-turnover-blacklist";
import { calculateKisUsMarketCap } from "@/lib/kis-us-market-cap";
import { loadUsTurnoverFilterSettings, DEFAULT_US_TURNOVER_FILTER_SETTINGS } from "@/lib/us-turnover-settings";
import { explainUsTurnoverFilters } from "@/lib/us-turnover-filter-explanation";

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
  openToHighRate: number;
  open?: number | null;
  high?: number | null;
  low?: number | null;
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
    openToHighRate: number | null;
    included: boolean;
    passedFilters?: string[];
    failedFilters?: string[];
  }>;
  snapshotAttempts: Array<{
    market: string;
    code: string;
    name: string;
    rawPrice: string;
    rawRate: string;
    snapshotStatus: "DETAIL_OK" | "DETAIL_FAILED";
    marketCap: number | null;
    tradingValue: number | null;
    turnoverRatio: number | null;
  }>;
  markets?: Array<{
    market: string;
    sourceCount: number;
    preDetailFilteredOutCount: number;
    priceDetailAttemptCount: number;
    priceDetailSuccessCount: number;
    priceDetailFailureCount: number;
    finalIncludedCount: number;
  }>;
};

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(String(value ?? "").replace(/,/g, "").replace(/%/g, "").trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function finiteNumberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(String(value ?? "").replace(/,/g, "").replace(/%/g, "").trim());
  return Number.isFinite(parsed) ? parsed : null;
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

async function enrichWithPriceDetails(output: unknown[], market: string, settings = DEFAULT_US_TURNOVER_FILTER_SETTINGS) {
  const result: unknown[] = Array.from({ length: output.length });
  const debug: UsTurnoverRatioDebug = { sourceCount: output.length, priceDetailAttemptCount: 0, priceDetailSuccessCount: 0, details: [], snapshotAttempts: [] };
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
      const detailMarketCap = calculateKisUsMarketCap(outputDetail);
      const detailTradingValue = firstNumber(outputDetail, ["tamt", "tamnt"]);
      const detailOpen = firstNumber(outputDetail, ["open"]);
      const detailHigh = firstNumber(outputDetail, ["high"]);
      const detailLow = firstNumber(outputDetail, ["low", "lw", "lowest"]);
      const openToHighRate = detailOpen !== null && detailHigh !== null && detailOpen > 0
        ? ((detailHigh - detailOpen) / detailOpen) * 100
        : null;
      result[index] = {
        ...item,
        ...outputDetail,
        symb: item.symb ?? code,
        __priceDetailMarketCap: detailMarketCap,
        __priceDetailTradingValue: detailTradingValue,
        __priceDetailOpen: detailOpen,
        __priceDetailHigh: detailHigh,
        __priceDetailLow: detailLow,
        __openToHighRate: openToHighRate,
      };
      const marketCap = detailMarketCap;
      const tradingValue = detailTradingValue;
      const turnoverRatio = marketCap !== null && tradingValue !== null ? (tradingValue / marketCap) * 100 : null;
      debug.snapshotAttempts.push({ market, code, name: String(item.name ?? item.company ?? ""), rawPrice: String(item.last ?? item.price ?? ""), rawRate: String(item.rate ?? item.changeRate ?? item.n_rate ?? ""), snapshotStatus: marketCap !== null && tradingValue !== null ? "DETAIL_OK" : "DETAIL_FAILED", marketCap, tradingValue, turnoverRatio });
      const explanation = detailMarketCap !== null && detailTradingValue !== null && openToHighRate !== null
        ? explainUsTurnoverFilters({ market, rank: index + 1, code, name: String(item.name ?? item.company ?? ""), price: String(item.last ?? item.price ?? ""), changeRate: String(item.rate ?? item.changeRate ?? item.n_rate ?? ""), marketCap: detailMarketCap, tradingValue: detailTradingValue, turnoverRatio: turnoverRatio ?? 0, openToHighRate }, settings)
        : null;
      debug.details[index] = { code, marketCap, tradingValue, turnoverRatio, openToHighRate, included: explanation?.passed ?? false, passedFilters: explanation?.passedFilters, failedFilters: explanation?.failedFilters };
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, output.length) }, () => worker()));
  debug.details = debug.details.filter(Boolean);
  return { output: result, debug };
}

export function filterUsTurnoverRatioItems(parsed: unknown, limit = 100, settings = DEFAULT_US_TURNOVER_FILTER_SETTINGS, options: { includeBelowMinTurnover?: boolean } = {}): UsTurnoverRatioItem[] {
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
    const openToHighRate = finiteNumberValue(item.__openToHighRate);
    if (marketCap === null || tradingValue === null) return [];
    if (openToHighRate === null || openToHighRate > settings.maxOpenToHighRate) return [];
    if (marketCap < settings.minMarketCap || marketCap > settings.maxMarketCap) return [];

    const turnoverRatio = (tradingValue / marketCap) * 100;
    if (turnoverRatio > settings.maxTurnoverRatio) return [];
    if (!options.includeBelowMinTurnover && turnoverRatio < settings.minTurnoverRatio) return [];

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
      openToHighRate,
      open: parsePrice(item.__priceDetailOpen),
      high: parsePrice(item.__priceDetailHigh),
      low: finiteNumberValue(item.__priceDetailLow),
    }];
  }).slice(0, limit);
}

export async function fetchUsTurnoverRatioScanner(request: KisUsTopRisingApiRequest = {}, markets = [request.excd || "AMS"], options: { includeBelowMinTurnover?: boolean } = {}) {
  const settings = await loadUsTurnoverFilterSettings();
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
      return price !== null && price < settings.maxPrice && rate !== null && rate < settings.maxRate;
    });
    const enriched = await enrichWithPriceDetails(detailEligibleOutput, market, settings);
    enriched.debug.sourceCount = output.length;
    enriched.debug.preDetailFilteredOutCount = output.length - detailEligibleOutput.length;
    return { result, enriched, market };
  }));
  const validResults = results.filter((value): value is NonNullable<typeof value> => value !== null);
  if (validResults.length === 0) return null;
  const blacklist = new Set(await loadUsTurnoverBlacklist());
  const filteredOutput = validResults.flatMap(({ enriched, market }) => enriched.output.map((rawItem) => {
    const item = rawItem as Record<string, unknown>;
    return {
    ...item,
    __market: market,
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
    snapshotAttempts: [...acc.snapshotAttempts, ...value.enriched.debug.snapshotAttempts],
  }), { sourceCount: 0, preDetailFilteredOutCount: 0, priceDetailAttemptCount: 0, priceDetailSuccessCount: 0, details: [] as UsTurnoverRatioDebug["details"], snapshotAttempts: [] as UsTurnoverRatioDebug["snapshotAttempts"] });
  const marketBreakdown = validResults.map(({ enriched, market }) => {
    const marketItems = enriched.output.filter((item) => item && typeof item === "object");
    const included = filterUsTurnoverRatioItems({ output: marketItems }, 100, settings, options).length;
    return {
      market,
      sourceCount: enriched.debug.sourceCount,
      preDetailFilteredOutCount: enriched.debug.preDetailFilteredOutCount || 0,
      priceDetailAttemptCount: enriched.debug.priceDetailAttemptCount,
      priceDetailSuccessCount: enriched.debug.priceDetailSuccessCount,
      priceDetailFailureCount: enriched.debug.priceDetailAttemptCount - enriched.debug.priceDetailSuccessCount,
      finalIncludedCount: included,
    };
  });
  return {
    ...first,
    filtered: filterUsTurnoverRatioItems({ output: filteredOutput }, 100, settings, options),
    debug: { ...debug, markets: marketBreakdown },
  };
}
