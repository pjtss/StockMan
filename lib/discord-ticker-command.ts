import { fetchKisUsPriceDetail, getKisUsPriceDetailOutput } from "@/lib/kis-us-price-detail";

export type TickerInfo = { ticker: string; market: string; name: string; price: number | null; rate: number | null; tradingValue: number | null; marketCap: number | null };

function numberValue(value: unknown) {
  const n = Number(String(value ?? "").replace(/,/g, "").replace(/%/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

export async function getTickerInfo(rawTicker: string): Promise<TickerInfo | null> {
  const ticker = rawTicker.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9.-]{0,14}$/.test(ticker) || /^\d+$/.test(ticker)) return null;
  for (const market of ["NAS", "NYS", "AMS"]) {
    const response = await fetchKisUsPriceDetail({ code: ticker, market });
    const output = getKisUsPriceDetailOutput(response?.parsed);
    if (!response?.ok) continue;
    const returned = String(output.rsym ?? output.symb ?? ticker).trim().toUpperCase();
    if (!(returned === ticker || returned.endsWith(`:${ticker}`))) continue;
    return { ticker, market, name: String(output.name ?? output.enname ?? output.kor_name ?? ticker), price: numberValue(output.last), rate: numberValue(output.t_xrat ?? output.t_rate), tradingValue: numberValue(output.tamt ?? output.tamnt), marketCap: numberValue(output.tomv) };
  }
  return null;
}

export function formatTickerInfo(info: TickerInfo | null) {
  if (!info) return "해당 티커를 지원되는 미국 주식(NAS/NYS/AMS)에서 찾을 수 없습니다.";
  const value = (n: number | null, suffix = "") => n === null ? "-" : `${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}${suffix}`;
  return [`**${info.ticker}** (${info.market})`, `종목명: ${info.name}`, `현재가: ${value(info.price)}`, `등락률: ${value(info.rate, "%")}`, `거래대금: ${value(info.tradingValue)}`, `시가총액: ${value(info.marketCap)}`].join("\n");
}
