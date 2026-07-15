import { fetchKisUsTopRisingApi, type KisUsTopRisingApiRequest } from "@/lib/kis-us-api";
import { fetchKisUsPriceDetail, getKisUsPriceDetailOutput } from "@/lib/kis-us-price-detail";

export type UsTurnoverRatioItem = {
  rank: number;
  code: string;
  name: string;
  price: string;
  changeRate: string;
  marketCap: number;
  tradingValue: number;
  turnoverRatio: number;
};

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(String(value ?? "").replace(/,/g, "").replace(/%/g, "").trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function firstNumber(item: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = numberValue(item[key]);
    if (value !== null) return value;
  }
  return null;
}

async function enrichWithPriceDetails(output: unknown[], market: string) {
  const result: unknown[] = [];
  for (const raw of output) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const code = String(item.symb ?? item.rsym ?? item.code ?? "").trim();
    if (!code) {
      result.push(item);
      continue;
    }
    const detail = await fetchKisUsPriceDetail({ code, market });
    const outputDetail = getKisUsPriceDetailOutput(detail?.parsed);
    result.push({ ...item, ...outputDetail, symb: item.symb ?? code });
  }
  return result;
}

export function filterUsTurnoverRatioItems(parsed: unknown, limit = 100): UsTurnoverRatioItem[] {
  const output = (parsed as { output?: unknown })?.output;
  if (!Array.isArray(output)) return [];

  return output.flatMap((raw, index) => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Record<string, unknown>;
    const marketCap = firstNumber(item, ["tomv", "marketCap", "mcap"]);
    const tradingValue = firstNumber(item, ["tamt", "tamnt", "amount", "tradingValue"]);
    if (marketCap === null || tradingValue === null) return [];

    const turnoverRatio = (tradingValue / marketCap) * 100;
    if (turnoverRatio < 1 || turnoverRatio > 5) return [];

    return [{
      rank: Number(item.rank ?? item.rnum ?? index + 1),
      code: String(item.symb ?? item.rsym ?? item.code ?? ""),
      name: String(item.name ?? item.company ?? item.enName ?? ""),
      price: String(item.last ?? item.price ?? ""),
      changeRate: String(item.rate ?? item.changeRate ?? ""),
      marketCap,
      tradingValue,
      turnoverRatio,
    }];
  }).slice(0, limit);
}

export async function fetchUsTurnoverRatioScanner(request: KisUsTopRisingApiRequest = {}) {
  const result = await fetchKisUsTopRisingApi(request);
  if (!result) return null;
  const parsed = result.response.parsed as { output?: unknown };
  const output = Array.isArray(parsed?.output) ? parsed.output.slice(0, 100) : [];
  const enrichedOutput = await enrichWithPriceDetails(output, request.excd || "AMS");
  return {
    ...result,
    filtered: filterUsTurnoverRatioItems({ output: enrichedOutput }, 100),
  };
}
