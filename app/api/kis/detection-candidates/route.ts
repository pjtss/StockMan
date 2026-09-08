import { NextResponse } from "next/server";
import { getAccessToken } from "@/lib/kis-token";
import { fetchDomesticFluctuation, fetchDomesticTradeValueRanking, fetchDomesticVolumePower } from "@/lib/kis-domestic-api";
import {
  fetchCreditBalanceRanking,
  fetchDisparityRanking,
  fetchAfterHourBalanceRanking,
  fetchBulkTransactionRanking,
  fetchUpperLowerCapture,
  fetchViStatus,
  fetchExpectedTransactionUpDown,
  fetchForeignInstitutionTotal,
  fetchForeignMemberEstimate,
  fetchMarketCapRanking,
  fetchMarketValueRanking,
  fetchNearNewHighLow,
  fetchDividendRateRanking,
  fetchHtsTopView,
  fetchQuoteBalanceRanking,
  fetchOvertimeVolumeRanking,
  fetchOvertimeFluctuationRanking,
  fetchProfitAssetIndexRanking,
  fetchFinanceRatioRanking,
  fetchCreditByCompany,
  fetchTradedByCompany,
  fetchTopInterestStock,
} from "@/lib/kis-investor-flow";
import { writeKisSignalSnapshot } from "@/lib/kis-signal-snapshot";

export const dynamic = "force-dynamic";

const SOURCES = [
  "trade-value", "volume-power", "fluctuation", "foreign-institution", "foreign-member",
  "credit-ranking", "bulk-transactions", "upper-capture", "after-hour", "disparity", "vi-status", "expected-updown", "near-high", "near-low", "market-cap", "market-value", "dividend-rate", "hts-top-view", "top-interest-stock", "quote-balance", "overtime-volume", "overtime-fluctuation", "profit-asset-index", "finance-ratio-ranking", "credit-by-company", "traded-by-company",
] as const;
type Source = typeof SOURCES[number];

function readSource(value: string | null): Source | null {
  return SOURCES.includes(value as Source) ? value as Source : null;
}

function normalizeRows(rows: Record<string, unknown>[], observedAt: string) {
  return rows.map((row, index) => ({
    ...row,
    rank: row.rank ?? row.data_rank ?? index + 1,
    code: String(row.code ?? row.mksc_shrn_iscd ?? row.stck_shrn_iscd ?? row.hts_kor_iscd ?? "").trim() || null,
    name: String(row.name ?? row.hts_kor_isnm ?? row.hts_kor_shr_nlen ?? "").trim() || null,
    observedAt,
  }));
}

function applyDomesticMarketCapFloor(rows: ReturnType<typeof normalizeRows>) {
  const floorInBillionWon = 300;
  let eligible = 0;
  let excluded = 0;
  const filtered = rows.filter((row) => {
    const sourceRow = row as Record<string, unknown>;
    const raw = sourceRow.marketCap ?? sourceRow.stck_avls ?? sourceRow.mrkt_cap ?? sourceRow.market_cap;
    if (raw === undefined || raw === null || String(raw).trim() === "") return true;
    const marketCapInBillionWon = Number(String(raw).replace(/,/g, ""));
    if (!Number.isFinite(marketCapInBillionWon)) return true;
    if (marketCapInBillionWon <= floorInBillionWon) {
      excluded += 1;
      return false;
    }
    eligible += 1;
    return true;
  });
  return { rows: filtered, stats: { floorInBillionWon, eligible, excluded, totalBefore: rows.length, totalAfter: filtered.length } };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const source = readSource(url.searchParams.get("source"));
  const market = (url.searchParams.get("market") ?? "J").trim() || "J";
  const collectedAt = new Date().toISOString();
  if (!source) return NextResponse.json({ ok: false, error: "INVALID_SOURCE", sources: SOURCES, collectedAt }, { status: 400 });

  const token = await getAccessToken();
  if (!token) return NextResponse.json({ ok: false, error: "KIS_TOKEN_UNAVAILABLE", source: "KIS", market, signalType: source, collectedAt }, { status: 503 });

  try {
    let result: { ok: boolean; rows: Record<string, unknown>[]; diagnostics?: unknown };
    if (source === "trade-value") {
      const rows = await fetchDomesticTradeValueRanking(token);
      result = { ok: true, rows: rows as unknown as Record<string, unknown>[], diagnostics: rows.diagnostics };
    } else if (source === "volume-power") {
      const rows = await fetchDomesticVolumePower(token);
      result = { ok: true, rows: rows as unknown as Record<string, unknown>[], diagnostics: rows.diagnostics };
    } else if (source === "fluctuation") {
      const rows = await fetchDomesticFluctuation(token);
      result = { ok: true, rows: rows as unknown as Record<string, unknown>[], diagnostics: rows.diagnostics };
    } else if (source === "dividend-rate") {
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const from = url.searchParams.get("fromDate") ?? `${today.slice(0, 4)}0101`;
      const dividend = await fetchDividendRateRanking(token, from, url.searchParams.get("toDate") ?? today, url.searchParams.get("marketGroup") ?? "0", url.searchParams.get("sector") ?? "0001", url.searchParams.get("stockType") ?? "0", url.searchParams.get("dividendType") ?? "2", url.searchParams.get("dividendClass") ?? "0");
      result = { ok: dividend.ok, rows: dividend.rows, diagnostics: { status: dividend.status, rtCd: dividend.rtCd, msgCd: dividend.msgCd, msg1: dividend.msg1 } };
    } else if (source === "hts-top-view") {
      const top = await fetchHtsTopView(token);
      result = { ok: top.ok, rows: top.rows, diagnostics: { status: top.status, rtCd: top.rtCd, msgCd: top.msgCd, msg1: top.msg1 } };
    } else if (source === "quote-balance") {
      const quote = await fetchQuoteBalanceRanking(token, market, url.searchParams.get("marketCode") ?? "0000", url.searchParams.get("sort") ?? "0");
      result = { ok: quote.ok, rows: quote.rows, diagnostics: { status: quote.status, rtCd: quote.rtCd, msgCd: quote.msgCd, msg1: quote.msg1 } };
    } else if (source === "overtime-volume" || source === "overtime-fluctuation") {
      const overtime = source === "overtime-volume"
        ? await fetchOvertimeVolumeRanking(token, market, url.searchParams.get("marketCode") ?? "0000", url.searchParams.get("sort") ?? "2")
        : await fetchOvertimeFluctuationRanking(token, market, url.searchParams.get("marketCode") ?? "0000", url.searchParams.get("sort") ?? "2");
      result = { ok: overtime.ok, rows: overtime.rows, diagnostics: { status: overtime.status, rtCd: overtime.rtCd, msgCd: overtime.msgCd, msg1: overtime.msg1 } };
    } else if (source === "profit-asset-index" || source === "finance-ratio-ranking") {
      const fiscalYear = url.searchParams.get("fiscalYear") ?? String(new Date().getFullYear() - 1);
      const ranking = source === "profit-asset-index"
        ? await fetchProfitAssetIndexRanking(token, fiscalYear, market, url.searchParams.get("metric") ?? "0", url.searchParams.get("quarter") ?? "3")
        : await fetchFinanceRatioRanking(token, fiscalYear, market, url.searchParams.get("metric") ?? "7", url.searchParams.get("quarter") ?? "3");
      result = { ok: ranking.ok, rows: ranking.rows, diagnostics: { status: ranking.status, rtCd: ranking.rtCd, msgCd: ranking.msgCd, msg1: ranking.msg1 } };
    } else if (source === "credit-by-company") {
      const credit = await fetchCreditByCompany(token, market, url.searchParams.get("marketCode") ?? "0000", url.searchParams.get("sort") ?? "1", url.searchParams.get("selectable") ?? "0");
      result = { ok: credit.ok, rows: credit.rows, diagnostics: { status: credit.status, rtCd: credit.rtCd, msgCd: credit.msgCd, msg1: credit.msg1 } };
    } else if (source === "traded-by-company") {
      const traded = await fetchTradedByCompany(token, market, url.searchParams.get("divCode") ?? "0", url.searchParams.get("sort") ?? "0", url.searchParams.get("startDate") ?? "", url.searchParams.get("endDate") ?? "", url.searchParams.get("marketCode") ?? "0000", url.searchParams.get("priceFrom") ?? "", url.searchParams.get("priceTo") ?? "");
      result = { ok: traded.ok, rows: traded.rows, diagnostics: { status: traded.status, rtCd: traded.rtCd, msgCd: traded.msgCd, msg1: traded.msg1 } };
    } else if (source === "top-interest-stock") {
      const interest = await fetchTopInterestStock(token, market, url.searchParams.get("sort") ?? "0", url.searchParams.get("marketCode") ?? "0000");
      result = { ok: interest.ok, rows: interest.rows, diagnostics: { status: interest.status, rtCd: interest.rtCd, msgCd: interest.msgCd, msg1: interest.msg1 } };
    } else {
      const flow = source === "foreign-institution"
        ? await fetchForeignInstitutionTotal(token, market)
        : source === "foreign-member"
          ? await fetchForeignMemberEstimate(token, market)
          : source === "credit-ranking"
            ? await fetchCreditBalanceRanking(token, market)
            : source === "bulk-transactions"
              ? await fetchBulkTransactionRanking(token, market)
              : source === "upper-capture"
                ? await fetchUpperLowerCapture(token, market)
                : source === "after-hour"
                  ? await fetchAfterHourBalanceRanking(token, market)
                  : source === "disparity"
                    ? await fetchDisparityRanking(token, market)
                    : source === "vi-status"
                      ? await fetchViStatus(token, url.searchParams.get("date") ?? undefined)
                      : source === "expected-updown"
                        ? await fetchExpectedTransactionUpDown(token, market, "0000", url.searchParams.get("sort") ?? "0", url.searchParams.get("session") === "close" ? "close" : "pre")
            : source === "near-high"
              ? await fetchNearNewHighLow(token, "0000", "high", market)
              : source === "near-low"
                ? await fetchNearNewHighLow(token, "0000", "low", market)
                : source === "market-cap"
                  ? await fetchMarketCapRanking(token, market)
                  : await fetchMarketValueRanking(token, url.searchParams.get("fiscalYear") ?? String(new Date().getFullYear() - 1), market, url.searchParams.get("metric") ?? "23", url.searchParams.get("quarter") ?? "3");
      result = { ok: flow.ok, rows: flow.rows as Record<string, unknown>[], diagnostics: { status: flow.status, rtCd: flow.rtCd, msgCd: flow.msgCd, msg1: flow.msg1 } };
    }
    const normalized = normalizeRows(result.rows, collectedAt);
    const filtered = applyDomesticMarketCapFloor(normalized);
    const rows = filtered.rows;
    await writeKisSignalSnapshot({ market: "KR", code: "0000", signalType: `candidate_${source}`, status: result.ok ? "AVAILABLE" : "UNAVAILABLE", observedAt: new Date(collectedAt), payload: rows });
    return NextResponse.json({ ok: result.ok, source: "KIS", market: "KR", signalType: source, collectedAt, rows, filter: filtered.stats, diagnostics: result.diagnostics }, { status: result.ok ? 200 : 502 });
  } catch (error) {
    return NextResponse.json({ ok: false, source: "KIS", market: "KR", signalType: source, collectedAt, error: error instanceof Error ? error.message.slice(0, 500) : "KIS_REQUEST_FAILED" }, { status: 502 });
  }
}
