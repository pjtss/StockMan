import { NextResponse } from "next/server";
import { getAccessToken } from "@/lib/kis-token";
import { fetchDailyTradeVolume, fetchDomesticDailyPrice, fetchTimeItemChartPrice, fetchTimeDailyChartPrice, fetchTimeIndexChartPrice, fetchIndexPrice, fetchIndexDailyPrice, fetchDomesticProductInfo, fetchDomesticStockInfo, fetchEtfPrice, fetchEtfComponentStockPrice, fetchEtfNavComparison, fetchEtfNavDailyTrend, fetchCurrentConclusion, fetchLendableByCompany, fetchForeignMemberPurchaseTrend, fetchForeignMemberTradeTrend, fetchInvestorByStock, fetchInvestorTrendEstimate, fetchInvestorTradeByStockDaily, fetchProgramTradeByStock, fetchProgramTradeByStockDaily, fetchDailyShortSale, fetchDailyCreditBalance, fetchNearNewHighLow, fetchDailyLoanTransaction, fetchViStatus, fetchMemberTrading, fetchMemberTradingDaily, fetchTimeItemConclusion, fetchTimeOvertimeConclusion, fetchExpectedPriceTrend, fetchInvestmentOpinionByBroker, fetchAskingPriceExpectedConclusion, fetchOvertimeAskingPrice, fetchOvertimePrice, fetchDailyOvertimePrice, fetchPrice2, fetchPriceBarTradeRatio, fetchTradeParticipationByAmount } from "@/lib/kis-investor-flow";
import { fetchKisUsTradeTrend, fetchKisUsAskingPrice, fetchKisUsPriceDetail, fetchKisUsMinuteChart, fetchKisUsPeriodPrice, fetchKisUsSearchInfo } from "@/lib/kis-us-trade-trend";
import { fetchKrPriceDetail } from "@/lib/kis-kr-price-detail";
import { writeKisSignalSnapshot } from "@/lib/kis-signal-snapshot";

export const dynamic = "force-dynamic";

function readDate(url: URL) {
  const value = url.searchParams.get("date")?.trim();
  if (!value) return undefined;
  if (!/^\d{8}$/.test(value)) return null;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return candidate.getUTCFullYear() === year && candidate.getUTCMonth() === month - 1 && candidate.getUTCDate() === day ? value : null;
}

function isValidDateValue(value: string | null) {
  if (!value || !/^\d{8}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return candidate.getUTCFullYear() === year && candidate.getUTCMonth() === month - 1 && candidate.getUTCDate() === day;
}

function isValidUsCode(value: string) {
  return /^[A-Z0-9][A-Z0-9.-]{0,15}$/.test(value);
}

function isValidUsExchange(value: string | null) {
  return value === null || ["NAS", "NYS", "AMS"].includes(value.toUpperCase());
}

function currentKstDate() {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}${values.month}${values.day}`;
}

function aggregateDomesticMinuteRows(rows: Record<string, unknown>[], interval: 1 | 5) {
  if (interval === 1) return rows;
  const timeKey = (row: Record<string, unknown>) => String(row.stck_cntg_hour ?? row.cntg_hour ?? row.time ?? "");
  const price = (row: Record<string, unknown>) => Number(row.stck_prpr ?? row.prpr ?? row.price ?? 0);
  const volume = (row: Record<string, unknown>) => Number(row.cntg_vol ?? row.stck_cntg_vol ?? row.volume ?? 0);
  const ordered = [...rows].sort((a, b) => timeKey(a).localeCompare(timeKey(b)));
  const grouped = new Map<string, Record<string, unknown>[]>();
  for (const row of ordered) {
    const time = timeKey(row);
    const minute = Number(time.slice(2, 4));
    const bucket = time.length >= 4 && Number.isFinite(minute) ? `${time.slice(0, 2)}${String(Math.floor(minute / interval) * interval).padStart(2, "0")}` : time;
    grouped.set(bucket, [...(grouped.get(bucket) ?? []), row]);
  }
  return [...grouped.entries()].map(([bucket, group]) => {
    const first = group[0];
    const prices = group.map(price).filter((value) => value > 0);
    const result = { ...first, stck_cntg_hour: bucket, stck_oprc: prices[0] ?? null, stck_hgpr: prices.length ? Math.max(...prices) : null, stck_lwpr: prices.length ? Math.min(...prices) : null, stck_prpr: prices.at(-1) ?? null, cntg_vol: group.reduce((sum, row) => sum + volume(row), 0), interval: 5 };
    return result;
  }).reverse();
}

async function handleGet(request: Request) {
  const url = new URL(request.url);
  const rawCode = (url.searchParams.get("code") ?? "").trim();
  const company = (url.searchParams.get("company") ?? "").trim() || null;
  const market = (url.searchParams.get("market") ?? "KR").toUpperCase();
  if (market !== "KR" && market !== "US") return NextResponse.json({ ok: false, error: "INVALID_MARKET", expected: "KR|US" }, { status: 400 });
  if (market === "US") {
    const code = rawCode.replace(/^US:/i, "").toUpperCase();
    if (!isValidUsCode(code)) return NextResponse.json({ ok: false, error: "INVALID_US_TICKER" }, { status: 400 });
    const requestedExchange = url.searchParams.get("exchange");
    if (!isValidUsExchange(requestedExchange)) return NextResponse.json({ ok: false, error: "INVALID_US_EXCHANGE", expected: "NAS|NYS|AMS" }, { status: 400 });
    const exchange = requestedExchange?.toUpperCase() as "NAS" | "NYS" | "AMS" | undefined;
    const requestedPeriod = url.searchParams.get("period");
    if (url.searchParams.get("mode") === "daily" && requestedPeriod !== null && !["0", "1", "2"].includes(requestedPeriod)) return NextResponse.json({ ok: false, error: "INVALID_US_PERIOD", expected: "0|1|2" }, { status: 400 });
    const requestedToDate = url.searchParams.get("toDate");
    if (url.searchParams.get("mode") === "daily" && requestedToDate?.trim() && !isValidDateValue(requestedToDate.trim())) return NextResponse.json({ ok: false, error: "INVALID_DATE", expected: "YYYYMMDD" }, { status: 400 });
    const requestedMinute = url.searchParams.get("minute") ?? "1";
    const requestedCount = Number(url.searchParams.get("count") ?? "120");
    if (url.searchParams.get("mode") === "minute" && !["1", "5", "10", "15", "30", "60"].includes(requestedMinute)) return NextResponse.json({ ok: false, error: "INVALID_US_MINUTE", expected: "1|5|10|15|30|60" }, { status: 400 });
    if (url.searchParams.get("mode") === "minute" && (!Number.isInteger(requestedCount) || requestedCount < 1 || requestedCount > 120)) return NextResponse.json({ ok: false, error: "INVALID_US_COUNT", expected: "1..120" }, { status: 400 });
    if (url.searchParams.get("mode") === "minute") {
      const result = await fetchKisUsMinuteChart({ code, market: exchange, minute: url.searchParams.get("minute") ?? "1", count: url.searchParams.get("count") ?? "120" });
      if (!result) return NextResponse.json({ ok: false, error: "KIS_TOKEN_UNAVAILABLE", source: "KIS", market, code }, { status: 503 });
      await writeKisSignalSnapshot({ market, code, signalType: "us_minute_chart", status: result.ok ? "AVAILABLE" : "UNAVAILABLE", payload: result.rows, rawPayload: result.rawText });
      return NextResponse.json({ ...result, source: "KIS", market, mode: "minute", instrument: { code, name: company }, flowStatus: result.ok ? "AVAILABLE" : "UNAVAILABLE", collectedAt: new Date().toISOString() }, { status: result.ok ? 200 : 502 });
    }
    if (url.searchParams.get("mode") === "daily") {
      const result = await fetchKisUsPeriodPrice({ code, market: exchange, period: (url.searchParams.get("period") as "0" | "1" | "2" | null) ?? "0", referenceDate: url.searchParams.get("toDate") ?? "", adjusted: "1" });
      if (!result) return NextResponse.json({ ok: false, error: "KIS_TOKEN_UNAVAILABLE", source: "KIS", market, code }, { status: 503 });
      await writeKisSignalSnapshot({ market, code, signalType: "us_daily_chart", status: result.ok ? "AVAILABLE" : "UNAVAILABLE", payload: result.rows, rawPayload: result.rawText });
      return NextResponse.json({ ...result, source: "KIS", market, mode: "daily", instrument: { code, name: company }, flowStatus: result.ok ? "AVAILABLE" : "UNAVAILABLE", collectedAt: new Date().toISOString() }, { status: result.ok ? 200 : 502 });
    }
    if (url.searchParams.get("mode") === "info") {
      const exchange = (url.searchParams.get("exchange") ?? "NAS").toUpperCase();
      const defaultProductType = exchange === "NYS" ? "513" : exchange === "AMS" ? "529" : "512";
      const result = await fetchKisUsSearchInfo({ code, productType: url.searchParams.get("productType") ?? defaultProductType });
      if (!result) return NextResponse.json({ ok: false, error: "KIS_TOKEN_UNAVAILABLE", source: "KIS", market, code }, { status: 503 });
      await writeKisSignalSnapshot({ market, code, signalType: "us_search_info", status: result.ok ? "AVAILABLE" : "UNAVAILABLE", payload: result.rows });
      return NextResponse.json({ ...result, source: "KIS", market, mode: "info", instrument: { code, name: company }, flowStatus: result.ok ? "AVAILABLE" : "UNAVAILABLE", collectedAt: new Date().toISOString() }, { status: result.ok ? 200 : 502 });
    }
    if (url.searchParams.get("mode") === "asking" || url.searchParams.get("mode") === "price-detail") {
      const detail = url.searchParams.get("mode") === "price-detail";
      const result = detail ? await fetchKisUsPriceDetail({ code, market: exchange }) : await fetchKisUsAskingPrice({ code, market: exchange });
      if (!result) return NextResponse.json({ ok: false, error: "KIS_TOKEN_UNAVAILABLE", source: "KIS", market, code }, { status: 503 });
      await writeKisSignalSnapshot({ market, code, signalType: detail ? "us_price_detail" : "us_asking_price", status: result.ok ? "AVAILABLE" : "UNAVAILABLE", payload: result.rows, rawPayload: result.rawText });
      return NextResponse.json({ ...result, source: "KIS", market, mode: detail ? "price-detail" : "asking", instrument: { code, name: company }, flowStatus: result.ok ? "AVAILABLE" : "UNAVAILABLE", collectedAt: new Date().toISOString() }, { status: result.ok ? 200 : 502 });
    }
    const result = await fetchKisUsTradeTrend({ code });
    if (!result) return NextResponse.json({ ok: false, error: "KIS_TOKEN_UNAVAILABLE", source: "KIS", market, code }, { status: 503 });
    await writeKisSignalSnapshot({ market, code, signalType: "us_trade_trend", status: result.ok ? "AVAILABLE" : "UNAVAILABLE", payload: result.trades, rawPayload: result.rawText });
    return NextResponse.json({ ok: result.ok, source: "KIS", market, code, instrument: { code, name: company }, flowStatus: result.ok ? "AVAILABLE" : "UNAVAILABLE", collectedAt: new Date().toISOString(), rows: result.trades, diagnostics: result.diagnostics, note: "KIS 해외주식 API는 국내식 외국인·기관·프로그램 투자자별 수급을 제공하지 않으며 체결·호가 데이터만 표시합니다." }, { status: result.ok ? 200 : 502 });
  }
  if (!/^\d{6}$/.test(rawCode)) return NextResponse.json({ ok: false, error: "INVALID_STOCK_CODE" }, { status: 400 });
  if (url.searchParams.get("mode") === "pbar") {
    const token = await getAccessToken();
    if (!token) return NextResponse.json({ ok: false, error: "KIS_TOKEN_UNAVAILABLE", source: "KIS", market: "KR", code: rawCode }, { status: 503 });
    const result = await fetchPriceBarTradeRatio(token, rawCode);
    await writeKisSignalSnapshot({ market: "KR", code: rawCode, signalType: "price_bar_trade_ratio", status: result.ok ? "AVAILABLE" : "UNAVAILABLE", payload: result.rows });
    return NextResponse.json({ ...result, source: "KIS", market: "KR", code: rawCode, instrument: { code: rawCode, name: company }, mode: "pbar", collectedAt: new Date().toISOString() }, { status: result.ok ? 200 : 502 });
  }
  if (url.searchParams.get("mode") === "product-info" || url.searchParams.get("mode") === "stock-info") {
    const token = await getAccessToken();
    if (!token) return NextResponse.json({ ok: false, error: "KIS_TOKEN_UNAVAILABLE", source: "KIS", market: "KR", code: rawCode }, { status: 503 });
    const mode = url.searchParams.get("mode");
    const result = mode === "product-info" ? await fetchDomesticProductInfo(token, rawCode) : await fetchDomesticStockInfo(token, rawCode);
    await writeKisSignalSnapshot({ market: "KR", code: rawCode, signalType: mode === "product-info" ? "domestic_product_info" : "domestic_stock_info", status: result.ok ? "AVAILABLE" : "UNAVAILABLE", payload: result.rows });
    return NextResponse.json({ ...result, source: "KIS", market: "KR", code: rawCode, mode, instrument: { code: rawCode, name: company }, collectedAt: new Date().toISOString() }, { status: result.ok ? 200 : 502 });
  }
  if (url.searchParams.get("mode") === "price-detail") {
    const result = await fetchKrPriceDetail(rawCode);
    if (!result) return NextResponse.json({ ok: false, error: "KIS_TOKEN_UNAVAILABLE", source: "KIS", market: "KR", code: rawCode }, { status: 503 });
    const row = { price: result.price, volume: result.volume, tradingValue: result.tradingValue, marketCap: result.marketCap, sharesOutstanding: result.sharesOutstanding, turnoverRatio: result.turnoverRatio, changeRate: result.changeRate, productMarket: result.productMarket, productName: result.productName };
    await writeKisSignalSnapshot({ market: "KR", code: rawCode, signalType: "kr_price_detail", status: result.ok ? "AVAILABLE" : "UNAVAILABLE", payload: [row], rawPayload: result.rawText });
    return NextResponse.json({ ok: result.ok, source: "KIS", market: "KR", code: rawCode, instrument: { code: rawCode, name: company }, mode: "price-detail", rows: [row], flowStatus: result.ok ? "AVAILABLE" : "UNAVAILABLE", collectedAt: new Date().toISOString() }, { status: result.ok ? 200 : 502 });
  }
  if (url.searchParams.get("mode") === "trade-participation") {
    const token = await getAccessToken();
    if (!token) return NextResponse.json({ ok: false, error: "KIS_TOKEN_UNAVAILABLE", source: "KIS", market: "KR", code: rawCode }, { status: 503 });
    const result = await fetchTradeParticipationByAmount(token, rawCode);
    await writeKisSignalSnapshot({ market: "KR", code: rawCode, signalType: "trade_participation_by_amount", status: result.ok ? "AVAILABLE" : "UNAVAILABLE", payload: result.rows });
    return NextResponse.json({ ...result, source: "KIS", market: "KR", code: rawCode, instrument: { code: rawCode, name: company }, mode: "trade-participation", collectedAt: new Date().toISOString() }, { status: result.ok ? 200 : 502 });
  }
  if (url.searchParams.get("mode") === "minute") {
    const token = await getAccessToken();
    if (!token) return NextResponse.json({ ok: false, error: "KIS_TOKEN_UNAVAILABLE", source: "KIS", market: "KR", code: rawCode }, { status: 503 });
    const interval = url.searchParams.get("minute") === "5" ? 5 : 1;
    const result = await fetchTimeItemChartPrice(token, rawCode, url.searchParams.get("hour") ?? "153000", url.searchParams.get("includePrevious") ?? "Y");
    if (interval === 5) result.rows = aggregateDomesticMinuteRows(result.rows as Record<string, unknown>[], interval) as typeof result.rows;
    await writeKisSignalSnapshot({ market: "KR", code: rawCode, signalType: "domestic_minute_chart", status: result.ok ? "AVAILABLE" : "UNAVAILABLE", payload: result.rows });
    return NextResponse.json({ ...result, source: "KIS", market: "KR", code: rawCode, instrument: { code: rawCode, name: company }, mode: "minute", interval, collectedAt: new Date().toISOString() }, { status: result.ok ? 200 : 502 });
  }
  if (url.searchParams.get("mode") === "daily-minute") {
    const requestedDate = url.searchParams.get("date");
    const parsedDate = readDate(url);
    if (requestedDate?.trim() && parsedDate === null) return NextResponse.json({ ok: false, error: "INVALID_DATE", expected: "YYYYMMDD" }, { status: 400 });
    const token = await getAccessToken();
    if (!token) return NextResponse.json({ ok: false, error: "KIS_TOKEN_UNAVAILABLE", source: "KIS", market: "KR", code: rawCode }, { status: 503 });
    const date = parsedDate ?? currentKstDate();
    const result = await fetchTimeDailyChartPrice(token, rawCode, date, url.searchParams.get("hour") ?? "153000", url.searchParams.get("includePrevious") ?? "N");
    await writeKisSignalSnapshot({ market: "KR", code: rawCode, signalType: "domestic_daily_minute_chart", status: result.ok ? "AVAILABLE" : "UNAVAILABLE", payload: result.rows });
    return NextResponse.json({ ...result, source: "KIS", market: "KR", code: rawCode, instrument: { code: rawCode, name: company }, mode: "daily-minute", date, collectedAt: new Date().toISOString() }, { status: result.ok ? 200 : 502 });
  }
  if (url.searchParams.get("mode") === "index-minute") {
    const token = await getAccessToken();
    if (!token) return NextResponse.json({ ok: false, error: "KIS_TOKEN_UNAVAILABLE", source: "KIS", market: "KR" }, { status: 503 });
    const indexCode = url.searchParams.get("indexCode") ?? "0001";
    const result = await fetchTimeIndexChartPrice(token, indexCode, url.searchParams.get("hour") ?? "60", url.searchParams.get("includePrevious") ?? "Y");
    await writeKisSignalSnapshot({ market: "KR", code: `INDEX:${indexCode}`, signalType: "index_minute_chart", status: result.ok ? "AVAILABLE" : "UNAVAILABLE", payload: result.rows });
    return NextResponse.json({ ...result, source: "KIS", market: "KR", code: `INDEX:${indexCode}`, mode: "index-minute", collectedAt: new Date().toISOString() }, { status: result.ok ? 200 : 502 });
  }
  if (url.searchParams.get("mode") === "index-current" || url.searchParams.get("mode") === "index-daily") {
    const token = await getAccessToken();
    if (!token) return NextResponse.json({ ok: false, error: "KIS_TOKEN_UNAVAILABLE", source: "KIS", market: "KR" }, { status: 503 });
    const indexCode = url.searchParams.get("indexCode") ?? "0001";
    const mode = url.searchParams.get("mode");
    const result = mode === "index-current" ? await fetchIndexPrice(token, indexCode) : await fetchIndexDailyPrice(token, indexCode, url.searchParams.get("startDate") ?? "");
    await writeKisSignalSnapshot({ market: "KR", code: `INDEX:${indexCode}`, signalType: mode === "index-current" ? "index_current" : "index_daily", status: result.ok ? "AVAILABLE" : "UNAVAILABLE", payload: result.rows });
    return NextResponse.json({ ...result, source: "KIS", market: "KR", code: `INDEX:${indexCode}`, mode, collectedAt: new Date().toISOString() }, { status: result.ok ? 200 : 502 });
  }
  if (["etf-price", "etf-components", "etf-nav", "etf-nav-daily"].includes(url.searchParams.get("mode") ?? "")) {
    const token = await getAccessToken();
    if (!token) return NextResponse.json({ ok: false, error: "KIS_TOKEN_UNAVAILABLE", source: "KIS", market: "KR" }, { status: 503 });
    const code = rawCode;
    const mode = url.searchParams.get("mode") as "etf-price" | "etf-components" | "etf-nav" | "etf-nav-daily";
    const result = mode === "etf-price" ? await fetchEtfPrice(token, code) : mode === "etf-components" ? await fetchEtfComponentStockPrice(token, code) : mode === "etf-nav" ? await fetchEtfNavComparison(token, code) : await fetchEtfNavDailyTrend(token, code, url.searchParams.get("startDate") ?? "", url.searchParams.get("endDate") ?? "");
    await writeKisSignalSnapshot({ market: "KR", code, signalType: mode, status: result.ok ? "AVAILABLE" : "UNAVAILABLE", payload: result.rows });
    return NextResponse.json({ ...result, source: "KIS", market: "KR", code, mode, collectedAt: new Date().toISOString() }, { status: result.ok ? 200 : 502 });
  }
  if (url.searchParams.get("mode") === "lendable") {
    const token = await getAccessToken();
    if (!token) return NextResponse.json({ ok: false, error: "KIS_TOKEN_UNAVAILABLE", source: "KIS", market: "KR", code: rawCode }, { status: 503 });
    const result = await fetchLendableByCompany(token, rawCode, url.searchParams.get("exchange") ?? "00", url.searchParams.get("lendableOnly") ?? "Y");
    await writeKisSignalSnapshot({ market: "KR", code: rawCode, signalType: "lendable_by_company", status: result.ok ? "AVAILABLE" : "UNAVAILABLE", payload: result.rows });
    return NextResponse.json({ ...result, source: "KIS", market: "KR", code: rawCode, instrument: { code: rawCode, name: company }, mode: "lendable", collectedAt: new Date().toISOString() }, { status: result.ok ? 200 : 502 });
  }
  if (url.searchParams.get("mode") === "ccnl") {
    const token = await getAccessToken();
    if (!token) return NextResponse.json({ ok: false, error: "KIS_TOKEN_UNAVAILABLE", source: "KIS", market: "KR", code: rawCode }, { status: 503 });
    const result = await fetchCurrentConclusion(token, rawCode);
    await writeKisSignalSnapshot({ market: "KR", code: rawCode, signalType: "current_conclusion", status: result.ok ? "AVAILABLE" : "UNAVAILABLE", payload: result.rows });
    return NextResponse.json({ ...result, source: "KIS", market: "KR", code: rawCode, instrument: { code: rawCode, name: company }, mode: "ccnl", collectedAt: new Date().toISOString() }, { status: result.ok ? 200 : 502 });
  }
  const mode: string = url.searchParams.get("mode") === "estimate" ? "estimate" : url.searchParams.get("mode") === "investor-daily" ? "investor-daily" : url.searchParams.get("mode") === "foreign-member-tick" ? "foreign-member-tick" : url.searchParams.get("mode") === "foreign-member" ? "foreign-member" : url.searchParams.get("mode") === "member-daily" ? "member-daily" : url.searchParams.get("mode") === "member" ? "member" : url.searchParams.get("mode") === "conclusion" ? "conclusion" : url.searchParams.get("mode") === "price2" ? "price2" : url.searchParams.get("mode") === "daily-price" ? "daily-price" : url.searchParams.get("mode") === "opinion-by-broker" ? "opinion-by-broker" : url.searchParams.get("mode") === "exp-price-trend" ? "exp-price-trend" : url.searchParams.get("mode") === "overtime-conclusion" ? "overtime-conclusion" : url.searchParams.get("mode") === "overtime-daily" ? "overtime-daily" : url.searchParams.get("mode") === "overtime-price" ? "overtime-price" : url.searchParams.get("mode") === "overtime-asking" ? "overtime-asking" : url.searchParams.get("mode") === "asking" ? "asking" : url.searchParams.get("mode") === "vi" ? "vi" : url.searchParams.get("mode") === "trade-volume" ? "trade-volume" : url.searchParams.get("mode") === "program" ? "program" : url.searchParams.get("mode") === "program-daily" ? "program-daily" : url.searchParams.get("mode") === "short-sale" ? "short-sale" : url.searchParams.get("mode") === "credit" ? "credit" : url.searchParams.get("mode") === "loan" ? "loan" : url.searchParams.get("mode") === "highlow" ? "highlow" : url.searchParams.get("mode") === "lowhigh" ? "lowhigh" : "investor";
  const date = readDate(url);
  if (date === null) return NextResponse.json({ ok: false, error: "INVALID_DATE", expected: "YYYYMMDD" }, { status: 400 });
  const startDate = url.searchParams.get("startDate");
  const endDate = url.searchParams.get("endDate");
  if (["member-daily", "opinion-by-broker"].includes(mode) && ((startDate && !isValidDateValue(startDate)) || (endDate && !isValidDateValue(endDate)) || (startDate && endDate && startDate > endDate))) return NextResponse.json({ ok: false, error: "INVALID_DATE_RANGE", expected: "startDate/endDate=YYYYMMDD and startDate<=endDate" }, { status: 400 });
  const hour = url.searchParams.get("hour") ?? "153000";
  if (mode === "conclusion" && !/^\d{6}$/.test(hour)) return NextResponse.json({ ok: false, error: "INVALID_HOUR", expected: "HHMMSS" }, { status: 400 });
  const period = url.searchParams.get("period") ?? "D";
  if (mode === "daily-price" && !["D", "W", "M"].includes(period)) return NextResponse.json({ ok: false, error: "INVALID_PERIOD", expected: "D|W|M" }, { status: 400 });
  const adjusted = url.searchParams.get("adjusted") ?? "1";
  if (mode === "daily-price" && !["0", "1"].includes(adjusted)) return NextResponse.json({ ok: false, error: "INVALID_ADJUSTED", expected: "0|1" }, { status: 400 });
  const token = await getAccessToken();
  if (!token) return NextResponse.json({ ok: false, error: "KIS_TOKEN_UNAVAILABLE", source: "KIS", market: "KR", code: rawCode }, { status: 503 });
  const resultDate = date ?? currentKstDate();
  let result = mode === "pbar" ? await fetchPriceBarTradeRatio(token, rawCode) : mode === "estimate" ? await fetchInvestorTrendEstimate(token, rawCode) : mode === "investor-daily" ? await fetchInvestorTradeByStockDaily(token, rawCode, resultDate) : mode === "foreign-member-tick" ? await fetchForeignMemberTradeTrend(token, rawCode, url.searchParams.get("memberCode") ?? "99999", url.searchParams.get("marketClass") ?? "A", url.searchParams.get("volumeFrom") ?? "1000") : mode === "foreign-member" ? await fetchForeignMemberPurchaseTrend(token, rawCode) : mode === "member-daily" ? await fetchMemberTradingDaily(token, rawCode, startDate ?? resultDate, endDate ?? resultDate, url.searchParams.get("memberCode") ?? "00003") : mode === "member" ? await fetchMemberTrading(token, rawCode) : mode === "conclusion" ? await fetchTimeItemConclusion(token, rawCode, hour) : mode === "price2" ? await fetchPrice2(token, rawCode) : mode === "opinion-by-broker" ? await fetchInvestmentOpinionByBroker(token, rawCode, startDate ?? resultDate, endDate ?? resultDate, "J", url.searchParams.get("opinionClass") ?? "0") : mode === "exp-price-trend" ? await fetchExpectedPriceTrend(token, rawCode, "J", url.searchParams.get("marketOpenClass") ?? "0") : mode === "overtime-conclusion" ? await fetchTimeOvertimeConclusion(token, rawCode, url.searchParams.get("hourClass") ?? "1") : mode === "overtime-daily" ? await fetchDailyOvertimePrice(token, rawCode) : mode === "overtime-price" ? await fetchOvertimePrice(token, rawCode) : mode === "overtime-asking" ? await fetchOvertimeAskingPrice(token, rawCode) : mode === "asking" ? await fetchAskingPriceExpectedConclusion(token, rawCode) : mode === "vi" ? await fetchViStatus(token, resultDate) : mode === "daily-price" ? await fetchDomesticDailyPrice(token, rawCode, period as "D" | "W" | "M", adjusted) : mode === "trade-volume" ? await fetchDailyTradeVolume(token, rawCode, "D", resultDate, resultDate) : mode === "program" ? await fetchProgramTradeByStock(token, rawCode) : mode === "program-daily" ? await fetchProgramTradeByStockDaily(token, rawCode) : mode === "short-sale" ? await fetchDailyShortSale(token, rawCode) : mode === "credit" ? await fetchDailyCreditBalance(token, rawCode, resultDate) : mode === "loan" ? await fetchDailyLoanTransaction(token, rawCode) : mode === "highlow" ? await fetchNearNewHighLow(token, "0000", "high") : mode === "lowhigh" ? await fetchNearNewHighLow(token, "0000", "low") : await fetchInvestorByStock(token, rawCode);
  if (mode === "vi") result = { ...result, rows: result.rows.filter((row) => String(row.mksc_shrn_iscd ?? row.stck_shrn_iscd ?? row.code ?? "").trim() === rawCode) };
  if (mode === "highlow" || mode === "lowhigh") {
    const rows = result.rows.filter((row) => String(row.mksc_shrn_iscd ?? row.stck_shrn_iscd ?? row.code ?? "").trim() === rawCode);
    result = { ...result, rows };
  }
  await writeKisSignalSnapshot({ market: "KR", code: rawCode, signalType: mode === "estimate" ? "investor_estimate" : mode === "investor-daily" ? "investor_trade_daily" : mode === "foreign-member-tick" ? "foreign_member_trade_tick" : mode === "foreign-member" ? "foreign_member_purchase" : mode === "member-daily" ? "member_trading_daily" : mode === "member" ? "member_trading" : mode === "conclusion" ? "time_item_conclusion" : mode === "price2" ? "price2" : mode === "daily-price" ? "domestic_daily_price" : mode === "opinion-by-broker" ? "opinion_by_broker" : mode === "exp-price-trend" ? "expected_price_trend" : mode === "overtime-conclusion" ? "overtime_time_conclusion" : mode === "overtime-daily" ? "overtime_daily_price" : mode === "overtime-price" ? "overtime_price" : mode === "overtime-asking" ? "overtime_asking_price" : mode === "asking" ? "asking_price_expected_conclusion" : mode === "vi" ? "vi_status" : mode === "trade-volume" ? "daily_trade_volume" : mode === "program" ? "program_trade" : mode === "program-daily" ? "program_trade_daily" : mode === "short-sale" ? "short_sale" : mode === "credit" ? "credit_balance" : mode === "loan" ? "loan_transaction" : mode === "highlow" ? "near_high" : mode === "lowhigh" ? "near_low" : "investor_confirmed", status: result.ok ? "AVAILABLE" : "UNAVAILABLE", payload: result.rows });
  return NextResponse.json({ ...result, source: "KIS", market: "KR", code: rawCode, instrument: { code: rawCode, name: company }, mode, flowStatus: result.ok ? (mode === "estimate" ? "ESTIMATED" : "CONFIRMED") : "UNAVAILABLE", collectedAt: new Date().toISOString() }, { status: result.ok ? 200 : 502 });
}

export async function GET(request: Request) {
  try {
    return await handleGet(request);
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 240) : "unknown error";
    console.error(`[KIS market-flow] request failed: ${message}`);
    return NextResponse.json({ ok: false, error: "KIS_MARKET_FLOW_FAILED", source: "KIS" }, { status: 502 });
  }
}
