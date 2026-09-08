import { kisRequest } from "./kis-request-framework";

const BASE_URL = "https://openapi.koreainvestment.com:9443";

export type InvestorFlowRow = Record<string, string | undefined>;

export type InvestorFlowResult = {
  ok: boolean;
  status: number;
  rows: InvestorFlowRow[];
  rtCd: string | null;
  msgCd: string | null;
  msg1: string | null;
};

export function classifyFlow(value: number | null): "BUYING" | "SELLING" | "NEUTRAL" | "UNAVAILABLE" {
  if (value === null || !Number.isFinite(value)) return "UNAVAILABLE";
  if (value > 0) return "BUYING";
  if (value < 0) return "SELLING";
  return "NEUTRAL";
}

async function getRows(path: string, trId: string, params: Record<string, string>, token: string): Promise<InvestorFlowResult> {
  const url = new URL(`${BASE_URL}${path}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const { response, parsed } = await kisRequest<{ rt_cd?: string; msg_cd?: string; msg1?: string; output?: unknown; output1?: unknown; output2?: unknown }>({
    url,
    token,
    trId,
    debug: { feature: "domestic-investor-flow", market: "KR" },
  });
  const data = parsed ?? {};
  return {
    ok: response.ok && data.rt_cd === "0",
    status: response.status,
    rows: Array.isArray(data.output) ? data.output as InvestorFlowRow[] : Array.isArray(data.output2) ? data.output2 as InvestorFlowRow[] : Array.isArray(data.output1) ? data.output1 as InvestorFlowRow[] : data.output2 && typeof data.output2 === "object" ? [data.output2 as InvestorFlowRow] : data.output1 && typeof data.output1 === "object" ? [data.output1 as InvestorFlowRow] : [],
    rtCd: data.rt_cd ?? null,
    msgCd: data.msg_cd ?? null,
    msg1: data.msg1 ?? null,
  };
}

/** 장 마감 후 확정 투자자별 수급. 외국인은 등록외국인+기타외국인이다. */
export function fetchInvestorByStock(token: string, code: string, market = "J") {
  return getRows("/uapi/domestic-stock/v1/quotations/inquire-investor", "FHKST01010900", {
    FID_COND_MRKT_DIV_CODE: market,
    FID_INPUT_ISCD: code,
  }, token);
}

/** 장중 입력 시점에 갱신되는 외국인·기관 추정 누계. */
export function fetchInvestorTrendEstimate(token: string, code: string) {
  return getRows("/uapi/domestic-stock/v1/quotations/investor-trend-estimate", "HHPTJ04160200", {
    MKSC_SHRN_ISCD: code,
  }, token);
}

/** 공식 샘플 [국내주식-074] 시장별 투자자매매동향(시세). */
export function fetchInvestorTimeByMarket(token: string, marketCode = "999", sectorCode = "S001") {
  return getRows("/uapi/domestic-stock/v1/quotations/inquire-investor-time-by-market", "FHPTJ04030000", {
    FID_INPUT_ISCD: marketCode,
    FID_INPUT_ISCD_2: sectorCode,
  }, token);
}

/** 공식 샘플 [국내주식-075] 시장별 투자자매매동향(일별). */
export function fetchInvestorDailyByMarket(token: string, date: string, marketCode = "0001", indexCode = "KSP", sectorCode = "0001") {
  return getRows("/uapi/domestic-stock/v1/quotations/inquire-investor-daily-by-market", "FHPTJ04040000", {
    FID_COND_MRKT_DIV_CODE: "U",
    FID_INPUT_ISCD: marketCode,
    FID_INPUT_DATE_1: date,
    FID_INPUT_ISCD_1: indexCode,
    FID_INPUT_DATE_2: date,
    FID_INPUT_ISCD_2: sectorCode,
  }, token);
}

/** 공식 샘플 [국내주식-013] 종목별 주식현재가 회원사. */
export function fetchMemberTrading(token: string, code: string, market = "J") {
  return getRows("/uapi/domestic-stock/v1/quotations/inquire-member", "FHKST01010600", {
    FID_COND_MRKT_DIV_CODE: market,
    FID_INPUT_ISCD: code,
  }, token);
}

/** 공식 샘플 [국내주식-197] 회원사별 종목매매동향 기간 조회. */
export function fetchMemberTradingDaily(token: string, code: string, startDate: string, endDate: string, memberCode = "00003", market = "J") {
  return getRows("/uapi/domestic-stock/v1/quotations/inquire-member-daily", "FHPST04540000", {
    FID_COND_MRKT_DIV_CODE: market,
    FID_INPUT_ISCD: code,
    FID_INPUT_ISCD_2: memberCode,
    FID_INPUT_DATE_1: startDate,
    FID_INPUT_DATE_2: endDate,
    FID_SCTN_CLS_CODE: "",
  }, token);
}

/** 공식 샘플 [국내주식-023] 종목별 당일 시간대별 체결. */
export function fetchTimeItemConclusion(token: string, code: string, hour = "153000", market = "J") {
  return getRows("/uapi/domestic-stock/v1/quotations/inquire-time-itemconclusion", "FHPST01060000", {
    FID_COND_MRKT_DIV_CODE: market,
    FID_INPUT_ISCD: code,
    FID_INPUT_HOUR_1: hour,
  }, token);
}

/** 공식 샘플 [국내주식-009] 종목별 현재 체결 흐름. */
export function fetchCurrentConclusion(token: string, code: string, market = "J") {
  return getRows("/uapi/domestic-stock/v1/quotations/inquire-ccnl", "FHKST01010300", {
    FID_COND_MRKT_DIV_CODE: market,
    FID_INPUT_ISCD: code,
  }, token);
}

/** 공식 샘플 [국내주식-011] 호가 및 예상체결. */
export function fetchAskingPriceExpectedConclusion(token: string, code: string, market = "J") {
  return getRows("/uapi/domestic-stock/v1/quotations/inquire-asking-price-exp-ccn", "FHKST01010200", {
    FID_COND_MRKT_DIV_CODE: market,
    FID_INPUT_ISCD: code,
  }, token);
}

/** 공식 국내주식-118. 장 시작 전 예상체결가·체결량 추이(최대 30건). */
export function fetchExpectedPriceTrend(token: string, code: string, market = "J", marketOpenClass = "0") {
  return getRows("/uapi/domestic-stock/v1/quotations/exp-price-trend", "FHPST01810000", {
    FID_COND_MRKT_DIV_CODE: market, FID_INPUT_ISCD: code, FID_MKOP_CLS_CODE: marketOpenClass,
  }, token);
}

/** 공식 샘플 [국내주식-077] 시간외호가. */
export function fetchOvertimeAskingPrice(token: string, code: string, market = "J") {
  return getRows("/uapi/domestic-stock/v1/quotations/inquire-overtime-asking-price", "FHPST02300400", {
    FID_COND_MRKT_DIV_CODE: market,
    FID_INPUT_ISCD: code,
  }, token);
}

/** 공식 샘플 [국내주식-076] 시간외현재가. */
export function fetchOvertimePrice(token: string, code: string, market = "J") {
  return getRows("/uapi/domestic-stock/v1/quotations/inquire-overtime-price", "FHPST02300000", {
    FID_COND_MRKT_DIV_CODE: market,
    FID_INPUT_ISCD: code,
  }, token);
}

/** 공식 샘플 [국내주식-026] 시간외 일자별 주가(최근 30건). */
export function fetchDailyOvertimePrice(token: string, code: string, market = "J") {
  return getRows("/uapi/domestic-stock/v1/quotations/inquire-daily-overtimeprice", "FHPST02320000", {
    FID_COND_MRKT_DIV_CODE: market,
    FID_INPUT_ISCD: code,
  }, token);
}

/** 공식 국내주식-025. 시간외 시간대별 체결 내역과 누적 체결을 조회한다. */
export function fetchTimeOvertimeConclusion(token: string, code: string, hourClass = "1", market = "J") {
  return getRows("/uapi/domestic-stock/v1/quotations/inquire-time-overtimeconclusion", "FHPST02310000", {
    FID_COND_MRKT_DIV_CODE: market, FID_INPUT_ISCD: code, FID_HOUR_CLS_CODE: hourClass,
  }, token);
}

/** 공식 샘플 [국내주식-054] 주식현재가 시세2. */
export function fetchPrice2(token: string, code: string, market = "J") {
  return getRows("/uapi/domestic-stock/v1/quotations/inquire-price-2", "FHPST01010000", {
    FID_COND_MRKT_DIV_CODE: market,
    FID_INPUT_ISCD: code,
  }, token);
}

/** 종목별 투자자 매매동향 일별. 확정 수급의 일자별 추이 조회용. */
export function fetchInvestorTradeByStockDaily(token: string, code: string, date = new Date().toISOString().slice(0, 10).replace(/-/g, ""), market = "J") {
  return getRows("/uapi/domestic-stock/v1/quotations/investor-trade-by-stock-daily", "FHPTJ04160001", {
    FID_COND_MRKT_DIV_CODE: market,
    FID_INPUT_ISCD: code,
    FID_INPUT_DATE_1: date,
    FID_ORG_ADJ_PRC: "",
    FID_ETC_CLS_CODE: "",
  }, token);
}

/** 종목별 외국계 순매수 추이. 외국인 전체 수급과 분리된 회원사 보조 신호. */
export function fetchForeignMemberPurchaseTrend(token: string, code: string, market = "J", memberCode = "99999") {
  return getRows("/uapi/domestic-stock/v1/quotations/frgnmem-pchs-trend", "FHKST644400C0", {
    FID_COND_MRKT_DIV_CODE: market,
    FID_INPUT_ISCD: code,
    FID_INPUT_ISCD_2: memberCode,
  }, token);
}

/** 공식 국내주식-163. 회원사 실시간 매매동향(틱)으로 외국계 체결 집중도를 보조 탐지한다. */
export function fetchForeignMemberTradeTrend(token: string, code: string, memberCode = "99999", marketClass = "A", volumeFrom = "1000") {
  return getRows("/uapi/domestic-stock/v1/quotations/frgnmem-trade-trend", "FHPST04320000", {
    FID_COND_SCR_DIV_CODE: "20432", FID_COND_MRKT_DIV_CODE: "J", FID_INPUT_ISCD: code,
    FID_INPUT_ISCD_2: memberCode, FID_MRKT_CLS_CODE: marketClass, FID_VOL_CNT: volumeFrom,
  }, token);
}

/** 특정 종목의 체결 기준 프로그램 매매 추이. */
export function fetchProgramTradeByStock(token: string, code: string, market = "J") {
  return getRows("/uapi/domestic-stock/v1/quotations/program-trade-by-stock", "FHPPG04600101", {
    FID_COND_MRKT_DIV_CODE: market,
    FID_INPUT_ISCD: code,
  }, token);
}

/** 특정 종목의 일별 프로그램 매매 추이. */
export function fetchProgramTradeByStockDaily(token: string, code: string, market = "J") {
  return getRows("/uapi/domestic-stock/v1/quotations/program-trade-by-stock-daily", "FHPPG04600201", {
    FID_COND_MRKT_DIV_CODE: market,
    FID_INPUT_ISCD: code,
  }, token);
}

/** 공식 샘플 [국내주식-114] 프로그램매매 종합현황(시간). 장중 최근 30분 구간입니다. */
export function fetchProgramTradeToday(token: string, market = "J", marketClass = "K", section = "", code = "", marketDiv = "", hour = "") {
  return getRows("/uapi/domestic-stock/v1/quotations/comp-program-trade-today", "FHPPG04600101", {
    FID_COND_MRKT_DIV_CODE: market,
    FID_MRKT_CLS_CODE: marketClass,
    FID_SCTN_CLS_CODE: section,
    FID_INPUT_ISCD: code,
    FID_COND_MRKT_DIV_CODE1: marketDiv,
    FID_INPUT_HOUR_1: hour,
  }, token);
}

/** 공식 샘플 [국내주식-115] 프로그램매매 종합현황(일별). */
export function fetchProgramTradeDailyMarket(token: string, startDate = "", endDate = "", market = "J", marketClass = "K") {
  return getRows("/uapi/domestic-stock/v1/quotations/comp-program-trade-daily", "FHPPG04600001", {
    FID_COND_MRKT_DIV_CODE: market,
    FID_MRKT_CLS_CODE: marketClass,
    FID_INPUT_DATE_1: startDate,
    FID_INPUT_DATE_2: endDate,
  }, token);
}

/** 공식 샘플 [국내주식-116] 프로그램매매 투자자매매동향(당일). */
export function fetchInvestorProgramTradeToday(token: string, marketClass = "1") {
  return getRows("/uapi/domestic-stock/v1/quotations/investor-program-trade-today", "HHPPG046600C1", {
    MRKT_DIV_CLS_CODE: marketClass,
  }, token);
}

/** 시장 전체 기관·외국인 매매종목 가집계. 순매수 후보 유니버스 생성용. */
export function fetchForeignInstitutionTotal(token: string, market = "V", screen = "16449", scope = "0000", sort = "0", direction = "0", investor = "0") {
  return getRows("/uapi/domestic-stock/v1/quotations/foreign-institution-total", "FHPTJ04400000", {
    FID_COND_MRKT_DIV_CODE: market,
    FID_COND_SCR_DIV_CODE: screen,
    FID_INPUT_ISCD: scope,
    FID_DIV_CLS_CODE: sort,
    FID_RANK_SORT_CLS_CODE: direction,
    FID_ETC_CLS_CODE: investor,
  }, token);
}

/** 외국계 증권사 매매종목 가집계. 외국인 전체 수급과 다른 보조 신호다. */
export function fetchForeignMemberEstimate(token: string, market = "J", screen = "16441", scope = "0000", sort = "0", direction = "0") {
  return getRows("/uapi/domestic-stock/v1/quotations/frgnmem-trade-estimate", "FHKST644100C0", {
    FID_COND_MRKT_DIV_CODE: market,
    FID_COND_SCR_DIV_CODE: screen,
    FID_INPUT_ISCD: scope,
    FID_RANK_SORT_CLS_CODE: sort,
    FID_RANK_SORT_CLS_CODE_2: direction,
  }, token);
}

/** 신용잔고 상위 종목. 신용 과열·반대매매 위험 필터용. */
export function fetchCreditBalanceRanking(token: string, market = "J", screen = "11701", scope = "0000", period = "2", sort = "0") {
  return getRows("/uapi/domestic-stock/v1/ranking/credit-balance", "FHKST17010000", {
    FID_COND_SCR_DIV_CODE: screen,
    FID_INPUT_ISCD: scope,
    FID_OPTION: period,
    FID_COND_MRKT_DIV_CODE: market,
    FID_RANK_SORT_CLS_CODE: sort,
  }, token);
}

/** 종목별 신용잔고 일별 추이. */
export function fetchDailyCreditBalance(token: string, code: string, settlementDate: string, market = "J", screen = "20476") {
  return getRows("/uapi/domestic-stock/v1/quotations/daily-credit-balance", "FHPST04760000", {
    FID_COND_MRKT_DIV_CODE: market,
    FID_COND_SCR_DIV_CODE: screen,
    FID_INPUT_ISCD: code,
    FID_INPUT_DATE_1: settlementDate,
  }, token);
}

/** 종목별 공매도 일별 추이. 공매도 비중·잔고 변화 보조 신호용. */
export function fetchDailyShortSale(token: string, code: string, startDate = "", endDate = "", market = "J") {
  return getRows("/uapi/domestic-stock/v1/quotations/daily-short-sale", "FHPST04830000", {
    FID_COND_MRKT_DIV_CODE: market,
    FID_INPUT_ISCD: code,
    FID_INPUT_DATE_1: startDate,
    FID_INPUT_DATE_2: endDate,
  }, token);
}

/** 신고가·신저가 근접 종목 순위. 종목별 상세 화면에서도 해당 종목의 근접 상태를 조회한다. */
export function fetchNearNewHighLow(token: string, code = "0000", nearType: "high" | "low" = "high", market = "J") {
  return getRows("/uapi/domestic-stock/v1/ranking/near-new-highlow", "FHPST01870000", {
    fid_aply_rang_vol: "0",
    fid_cond_mrkt_div_code: market,
    fid_cond_scr_div_code: "20187",
    fid_div_cls_code: "0",
    fid_input_cnt_1: "0",
    fid_input_cnt_2: "100",
    fid_prc_cls_code: nearType === "high" ? "0" : "1",
    fid_input_iscd: code,
    fid_trgt_cls_code: "0",
    fid_trgt_exls_cls_code: "0",
    fid_aply_rang_prc_1: "0",
    fid_aply_rang_prc_2: "1000000",
  }, token);
}

/** 시가총액 상위 종목. 국내 유니버스 규모·유동성 필터의 공식 보조 원천. */
export function fetchMarketCapRanking(token: string, market = "J", scope = "0000", commonOnly = "1") {
  return getRows("/uapi/domestic-stock/v1/ranking/market-cap", "FHPST01740000", {
    fid_input_price_2: "",
    fid_cond_mrkt_div_code: market,
    fid_cond_scr_div_code: "20174",
    fid_div_cls_code: commonOnly,
    fid_input_iscd: scope,
    fid_trgt_cls_code: "0",
    fid_trgt_exls_cls_code: "0",
    fid_input_price_1: "",
    fid_vol_cnt: "",
  }, token);
}

/** PER/PBR/PSR/EPS 등 시장가치 순위. 가격·수급 후보의 재무 과대평가 필터용. */
export function fetchMarketValueRanking(token: string, fiscalYear: string, market = "J", metric = "23", quarter = "3", scope = "0000") {
  return getRows("/uapi/domestic-stock/v1/ranking/market-value", "FHPST01790000", {
    fid_trgt_cls_code: "0",
    fid_cond_mrkt_div_code: market,
    fid_cond_scr_div_code: "20179",
    fid_input_iscd: scope,
    fid_div_cls_code: "0",
    fid_input_price_1: "",
    fid_input_price_2: "",
    fid_vol_cnt: "",
    fid_input_option_1: fiscalYear,
    fid_input_option_2: quarter,
    fid_rank_sort_cls_code: metric,
    fid_blng_cls_code: "0",
    fid_trgt_exls_cls_code: "0",
  }, token);
}

/** 공식 순위분석 API: 수익자산지표 순위. */
export function fetchProfitAssetIndexRanking(token: string, fiscalYear: string, market = "J", metric = "0", quarter = "3", scope = "0000") {
  return getRows("/uapi/domestic-stock/v1/ranking/profit-asset-index", "FHPST01730000", {
    FID_COND_MRKT_DIV_CODE: market, FID_INPUT_ISCD: scope, FID_INPUT_OPTION_1: fiscalYear, FID_INPUT_OPTION_2: quarter,
    FID_RANK_SORT_CLS_CODE: metric, FID_DIV_CLS_CODE: "0", FID_TRGT_CLS_CODE: "0", FID_TRGT_EXLS_CLS_CODE: "0",
  }, token);
}

/** 공식 순위분석 API: 재무비율 순위. */
export function fetchFinanceRatioRanking(token: string, fiscalYear: string, market = "J", metric = "7", quarter = "3", scope = "0000") {
  return getRows("/uapi/domestic-stock/v1/ranking/finance-ratio", "FHPST01750000", {
    FID_COND_MRKT_DIV_CODE: market, FID_INPUT_ISCD: scope, FID_INPUT_OPTION_1: fiscalYear, FID_INPUT_OPTION_2: quarter,
    FID_RANK_SORT_CLS_CODE: metric, FID_DIV_CLS_CODE: "0", FID_TRGT_CLS_CODE: "0", FID_TRGT_EXLS_CLS_CODE: "0",
  }, token);
}

/** 종목별 일별 대차거래추이. 대차잔고 증가와 공매도 압력 교차검증용. */
export function fetchDailyLoanTransaction(token: string, code: string, startDate = "", endDate = "", marketClass = "3") {
  return getRows("/uapi/domestic-stock/v1/quotations/daily-loan-trans", "HHPST074500C0", {
    MRKT_DIV_CLS_CODE: marketClass,
    MKSC_SHRN_ISCD: code,
    START_DATE: startDate,
    END_DATE: endDate,
    CTS: "",
  }, token);
}

/** 대량체결건수 상위. 큰 체결이 집중되는 종목 후보 탐지용. */
export function fetchBulkTransactionRanking(token: string, market = "J", scope = "0000", side = "0") {
  return getRows("/uapi/domestic-stock/v1/ranking/bulk-trans-num", "FHKST190900C0", {
    fid_aply_rang_prc_2: "",
    fid_cond_mrkt_div_code: market,
    fid_cond_scr_div_code: "11909",
    fid_input_iscd: scope,
    fid_rank_sort_cls_code: side,
    fid_div_cls_code: "0",
    fid_input_price_1: "",
    fid_aply_rang_prc_1: "",
    fid_input_iscd_2: "",
    fid_trgt_exls_cls_code: "0",
    fid_trgt_cls_code: "0",
    fid_vol_cnt: "",
  }, token);
}

/** 상·하한가 및 근접 종목 포착. 급격한 가격 이상 탐지용. */
export function fetchUpperLowerCapture(token: string, market = "J", scope = "0000", priceType: "upper" | "lower" = "upper", proximity = "0") {
  return getRows("/uapi/domestic-stock/v1/quotations/capture-uplowprice", "FHKST130000C0", {
    FID_COND_MRKT_DIV_CODE: market,
    FID_COND_SCR_DIV_CODE: "11300",
    FID_PRC_CLS_CODE: priceType === "upper" ? "0" : "1",
    FID_DIV_CLS_CODE: proximity,
    FID_INPUT_ISCD: scope,
    FID_TRGT_CLS_CODE: "0",
    FID_TRGT_EXLS_CLS_CODE: "0",
    FID_INPUT_PRICE_1: "",
    FID_INPUT_PRICE_2: "",
    FID_VOL_CNT: "",
  }, token);
}

/** 장외 시간외 잔량 순위. 장 마감 후 다음 세션 수급 후보 보조 신호용. */
export function fetchAfterHourBalanceRanking(token: string, market = "J", scope = "0000", sort = "4") {
  return getRows("/uapi/domestic-stock/v1/ranking/after-hour-balance", "FHPST01760000", {
    fid_input_price_1: "",
    fid_cond_mrkt_div_code: market,
    fid_cond_scr_div_code: "20176",
    fid_rank_sort_cls_code: sort,
    fid_div_cls_code: "0",
    fid_input_iscd: scope,
    fid_trgt_exls_cls_code: "0",
    fid_trgt_cls_code: "0",
    fid_vol_cnt: "",
    fid_input_price_2: "",
  }, token);
}

/** 종목 재무비율: PER/PBR 등 장기 탐지 필터의 원천 데이터. */
export function fetchFinancialRatio(token: string, code: string, period: "annual" | "quarter" = "annual", market = "J") {
  return getRows("/uapi/domestic-stock/v1/finance/financial-ratio", "FHKST66430300", { FID_DIV_CLS_CODE: period === "annual" ? "0" : "1", fid_cond_mrkt_div_code: market, fid_input_iscd: code }, token);
}

/** 종목 성장성비율: 매출·이익 성장 후보 검증용. */
export function fetchGrowthRatio(token: string, code: string, period: "annual" | "quarter" = "annual", market = "J") {
  return getRows("/uapi/domestic-stock/v1/finance/growth-ratio", "FHKST66430800", { fid_input_iscd: code, fid_div_cls_code: period === "annual" ? "0" : "1", fid_cond_mrkt_div_code: market }, token);
}

/** 종목 수익성비율: ROE/영업이익률 등 수익성 검증용. */
export function fetchProfitRatio(token: string, code: string, period: "annual" | "quarter" = "annual", market = "J") {
  return getRows("/uapi/domestic-stock/v1/finance/profit-ratio", "FHKST66430400", { fid_input_iscd: code, FID_DIV_CLS_CODE: period === "annual" ? "0" : "1", fid_cond_mrkt_div_code: market }, token);
}

/** 종목 안정성비율: 부채·유동성 등 위험 필터용. */
export function fetchStabilityRatio(token: string, code: string, period: "annual" | "quarter" = "annual", market = "J") {
  return getRows("/uapi/domestic-stock/v1/finance/stability-ratio", "FHKST66430600", { fid_input_iscd: code, fid_div_cls_code: period === "annual" ? "0" : "1", fid_cond_mrkt_div_code: market }, token);
}

/** 공식 종목정보 API: 대차대조표. */
export function fetchBalanceSheet(token: string, code: string, period: "annual" | "quarter" = "annual", market = "J") {
  return getRows("/uapi/domestic-stock/v1/finance/balance-sheet", "FHKST66430100", { fid_input_iscd: code, fid_div_cls_code: period === "annual" ? "0" : "1", fid_cond_mrkt_div_code: market }, token);
}

/** 공식 종목정보 API: 손익계산서. */
export function fetchIncomeStatement(token: string, code: string, period: "annual" | "quarter" = "annual", market = "J") {
  return getRows("/uapi/domestic-stock/v1/finance/income-statement", "FHKST66430200", { fid_input_iscd: code, fid_div_cls_code: period === "annual" ? "0" : "1", fid_cond_mrkt_div_code: market }, token);
}

/** 공식 종목정보 API: 기타 주요비율. */
export function fetchOtherMajorRatios(token: string, code: string, period: "annual" | "quarter" = "annual", market = "J") {
  return getRows("/uapi/domestic-stock/v1/finance/other-major-ratios", "FHKST66430500", { fid_input_iscd: code, fid_div_cls_code: period === "annual" ? "0" : "1", fid_cond_mrkt_div_code: market }, token);
}

/** 이격도 순위. 단기 과열·과매도 후보 탐지용. */
export function fetchDisparityRanking(token: string, market = "J", scope = "0000", period = "5", sort: "high" | "low" = "high") {
  return getRows("/uapi/domestic-stock/v1/ranking/disparity", "FHPST01780000", {
    fid_input_price_2: "",
    fid_cond_mrkt_div_code: market,
    fid_cond_scr_div_code: "20178",
    fid_div_cls_code: "0",
    fid_rank_sort_cls_code: sort === "high" ? "0" : "1",
    fid_hour_cls_code: period,
    fid_input_iscd: scope,
    fid_trgt_cls_code: "0",
    fid_trgt_exls_cls_code: "0",
    fid_input_price_1: "",
    fid_vol_cnt: "",
  }, token);
}

/** 변동성완화장치(VI) 현황. 급격한 가격·체결 이상 후보 탐지용. */
export function fetchViStatus(token: string, date = new Date().toISOString().slice(0, 10).replace(/-/g, ""), market = "0", scope = "", direction: "all" | "up" | "down" = "all") {
  return getRows("/uapi/domestic-stock/v1/quotations/inquire-vi-status", "FHPST01390000", {
    FID_DIV_CLS_CODE: direction === "up" ? "1" : direction === "down" ? "2" : "0",
    FID_COND_SCR_DIV_CODE: "20139",
    FID_MRKT_CLS_CODE: market,
    FID_INPUT_ISCD: scope,
    FID_RANK_SORT_CLS_CODE: "0",
    FID_INPUT_DATE_1: date,
    FID_TRGT_CLS_CODE: "0",
    FID_TRGT_EXLS_CLS_CODE: "0",
  }, token);
}

/** 예상체결 상승·하락 순위. 장전·장마감 예상체결 모멘텀 후보용. */
export function fetchExpectedTransactionUpDown(token: string, market = "J", scope = "0000", sort = "0", session: "pre" | "close" = "pre") {
  return getRows("/uapi/domestic-stock/v1/ranking/exp-trans-updown", "FHPST01820000", {
    fid_rank_sort_cls_code: sort,
    fid_cond_mrkt_div_code: market,
    fid_cond_scr_div_code: "20182",
    fid_input_iscd: scope,
    fid_div_cls_code: "0",
    fid_aply_rang_prc_1: "",
    fid_vol_cnt: "",
    fid_pbmn: "",
    fid_blng_cls_code: "0",
    fid_mkop_cls_code: session === "pre" ? "0" : "1",
  }, token);
}

/** 종목 투자의견 이력. 증권사 의견·목표가 변화 보조 정보용. */
export function fetchInvestmentOpinion(token: string, code: string, startDate: string, endDate: string, market = "J") {
  return getRows("/uapi/domestic-stock/v1/quotations/invest-opinion", "FHKST663300C0", {
    FID_COND_MRKT_DIV_CODE: market,
    FID_COND_SCR_DIV_CODE: "16633",
    FID_INPUT_ISCD: code,
    FID_INPUT_DATE_1: startDate,
    FID_INPUT_DATE_2: endDate,
  }, token);
}

/** 공식 국내주식-189. 증권사별 투자의견·등급 변화 보조 신호. */
export function fetchInvestmentOpinionByBroker(token: string, code: string, startDate: string, endDate: string, market = "J", opinionClass = "0") {
  return getRows("/uapi/domestic-stock/v1/quotations/invest-opbysec", "FHKST663400C0", {
    FID_COND_MRKT_DIV_CODE: market, FID_COND_SCR_DIV_CODE: "16634", FID_INPUT_ISCD: code,
    FID_DIV_CLS_CODE: opinionClass, FID_INPUT_DATE_1: startDate, FID_INPUT_DATE_2: endDate,
  }, token);
}

/** 국내 증시자금 종합. 시장 유동성·신용 위험 배경 신호용. */
export function fetchMarketFunds(token: string, date = "") {
  return getRows("/uapi/domestic-stock/v1/quotations/mktfunds", "FHKST649100C0", { FID_INPUT_DATE_1: date }, token);
}

/** 종목별 일별 매수·매도 체결량. 매수/매도 체결 불균형 보조 신호용. */
export function fetchDailyTradeVolume(token: string, code: string, period = "D", startDate = "", endDate = "", market = "J") {
  return getRows("/uapi/domestic-stock/v1/quotations/inquire-daily-trade-volume", "FHKST03010800", {
    FID_COND_MRKT_DIV_CODE: market,
    FID_INPUT_ISCD: code,
    FID_PERIOD_DIV_CODE: period,
    FID_INPUT_DATE_1: startDate,
    FID_INPUT_DATE_2: endDate,
  }, token);
}

/** 공식 국내주식-010. 최근 30건의 일·주·월별 시세 요약을 조회한다. */
export function fetchDomesticDailyPrice(token: string, code: string, period: "D" | "W" | "M" = "D", adjusted = "1", market = "J") {
  return getRows("/uapi/domestic-stock/v1/quotations/inquire-daily-price", "FHKST01010400", {
    FID_COND_MRKT_DIV_CODE: market, FID_INPUT_ISCD: code, FID_PERIOD_DIV_CODE: period, FID_ORG_ADJ_PRC: adjusted,
  }, token);
}

/** 공식 샘플 [국내주식-022] 당일 분봉 체결. 최대 30건의 현재일 분봉을 반환합니다. */
export function fetchTimeItemChartPrice(token: string, code: string, hour = "153000", includePrevious = "Y", market = "J") {
  return getRows("/uapi/domestic-stock/v1/quotations/inquire-time-itemchartprice", "FHKST03010200", {
    FID_COND_MRKT_DIV_CODE: market,
    FID_INPUT_ISCD: code,
    FID_INPUT_HOUR_1: hour,
    FID_PW_DATA_INCU_YN: includePrevious,
    FID_ETC_CLS_CODE: "",
  }, token);
}

/** 공식 국내주식-213. 지정한 과거 거래일의 분봉을 조회한다(최대 120건). */
export function fetchTimeDailyChartPrice(token: string, code: string, date: string, hour = "153000", includePrevious = "N", includeFakeTick = "", market = "J") {
  return getRows("/uapi/domestic-stock/v1/quotations/inquire-time-dailychartprice", "FHKST03010230", {
    FID_COND_MRKT_DIV_CODE: market, FID_INPUT_ISCD: code, FID_INPUT_HOUR_1: hour,
    FID_INPUT_DATE_1: date, FID_PW_DATA_INCU_YN: includePrevious, FID_FAKE_TICK_INCU_YN: includeFakeTick,
  }, token);
}

/** 공식 샘플 [국내주식-045] 업종 분봉. 종목 탐지의 시장 레짐·업종 모멘텀 보조 신호용. */
export function fetchTimeIndexChartPrice(token: string, indexCode = "0001", hour = "60", includePrevious = "Y", market = "U", etcClass = "0") {
  return getRows("/uapi/domestic-stock/v1/quotations/inquire-time-indexchartprice", "FHKUP03500200", {
    FID_COND_MRKT_DIV_CODE: market,
    FID_ETC_CLS_CODE: etcClass,
    FID_INPUT_ISCD: indexCode,
    FID_INPUT_HOUR_1: hour,
    FID_PW_DATA_INCU_YN: includePrevious,
  }, token);
}

/** 공식 샘플 [국내주식-063] 국내업종 현재지수. */
export function fetchIndexPrice(token: string, indexCode = "0001", market = "U") {
  return getRows("/uapi/domestic-stock/v1/quotations/inquire-index-price", "FHPUP02100000", {
    FID_COND_MRKT_DIV_CODE: market,
    FID_INPUT_ISCD: indexCode,
  }, token);
}

/** 공식 샘플 [국내주식-065] 국내업종 일자별지수. */
export function fetchIndexDailyPrice(token: string, indexCode = "0001", startDate = "", market = "U", period = "D") {
  return getRows("/uapi/domestic-stock/v1/quotations/inquire-daily-indexchartprice", "FHKUP03500100", {
    FID_COND_MRKT_DIV_CODE: market,
    FID_INPUT_ISCD: indexCode,
    FID_INPUT_DATE_1: startDate,
    FID_PERIOD_DIV_CODE: period,
    FID_COND_SCR_DIV_CODE: "20214",
    FID_MRKT_CLS_CODE: "K",
    FID_BLNG_CLS_CODE: "0",
  }, token);
}

/** 공식 ETF/ETN 샘플 [국내주식-073] 구성종목 시세. */
export function fetchEtfComponentStockPrice(token: string, code: string, market = "J", screen = "11216") {
  return getRows("/uapi/etfetn/v1/quotations/inquire-component-stock-price", "FHKST121600C0", {
    FID_COND_MRKT_DIV_CODE: market,
    FID_INPUT_ISCD: code,
    FID_COND_SCR_DIV_CODE: screen,
  }, token);
}

/** 공식 ETF/ETN 샘플 [국내주식-068] ETF/ETN 현재가. */
export function fetchEtfPrice(token: string, code: string, market = "J") {
  return getRows("/uapi/etfetn/v1/quotations/inquire-price", "FHPST02400000", {
    FID_COND_MRKT_DIV_CODE: market,
    FID_INPUT_ISCD: code,
  }, token);
}

/** 공식 상품기본조회 [국내주식-029]. 국내 종목의 시장·상장·거래정지 메타데이터. */
export function fetchDomesticProductInfo(token: string, code: string, productType = "300") {
  return getRows("/uapi/domestic-stock/v1/quotations/search-info", "CTPF1604R", { PRDT_TYPE_CD: productType, PDNO: code }, token);
}

/** 공식 주식기본조회 [국내주식-067]. 상장주수·업종·KOSPI200·NXT 상태 등. */
export function fetchDomesticStockInfo(token: string, code: string, productType = "300") {
  return getRows("/uapi/domestic-stock/v1/quotations/search-stock-info", "CTPF1002R", { PRDT_TYPE_CD: productType, PDNO: code }, token);
}

/** 공식 ETF/ETN 샘플 [국내주식-069] NAV 비교추이(종목). */
export function fetchEtfNavComparison(token: string, code: string, market = "J") {
  return getRows("/uapi/etfetn/v1/quotations/nav-comparison-trend", "FHPST02440000", {
    FID_COND_MRKT_DIV_CODE: market,
    FID_INPUT_ISCD: code,
  }, token);
}

/** 공식 ETF/ETN 샘플 [국내주식-071] NAV 비교추이(일). */
export function fetchEtfNavDailyTrend(token: string, code: string, startDate: string, endDate: string, market = "J") {
  return getRows("/uapi/etfetn/v1/quotations/nav-comparison-daily-trend", "FHPST02440200", {
    FID_COND_MRKT_DIV_CODE: market,
    FID_INPUT_ISCD: code,
    FID_INPUT_DATE_1: startDate,
    FID_INPUT_DATE_2: endDate,
  }, token);
}

/** 공식 샘플 [국내주식-106] 배당률 상위. */
export function fetchDividendRateRanking(token: string, fromDate: string, toDate: string, marketGroup = "0", sector = "0001", stockType = "0", dividendType = "2", dividendClass = "0", cursor = "") {
  return getRows("/uapi/domestic-stock/v1/ranking/dividend-rate", "HHKDB13470100", {
    CTS_AREA: cursor,
    GB1: marketGroup,
    UPJONG: sector,
    GB2: stockType,
    GB3: dividendType,
    F_DT: fromDate,
    T_DT: toDate,
    GB4: dividendClass,
  }, token);
}

/** 공식 샘플 [국내주식-214] HTS 조회상위 20종목. */
export function fetchHtsTopView(token: string) {
  return getRows("/uapi/domestic-stock/v1/ranking/hts-top-view", "HHMCM000100C0", {}, token);
}

/** 공식 관심종목 API: 관심종목등록 상위. */
export function fetchTopInterestStock(token: string, market = "J", sort = "0", marketCode = "0000") {
  return getRows("/uapi/domestic-stock/v1/ranking/top-interest-stock", "FHPST01800000", {
    FID_COND_MRKT_DIV_CODE: market, FID_COND_SCR_DIV_CODE: "20180", FID_INPUT_ISCD: marketCode,
    FID_RANK_SORT_CLS_CODE: sort, FID_DIV_CLS_CODE: "0", FID_TRGT_CLS_CODE: "0", FID_TRGT_EXLS_CLS_CODE: "0",
  }, token);
}

/** 공식 샘플 [국내주식-089] 호가잔량 순위. */
export function fetchQuoteBalanceRanking(token: string, market = "J", marketCode = "0000", sort = "0") {
  return getRows("/uapi/domestic-stock/v1/ranking/quote-balance", "FHPST01720000", {
    FID_VOL_CNT: "",
    FID_COND_MRKT_DIV_CODE: market,
    FID_COND_SCR_DIV_CODE: "20172",
    FID_INPUT_ISCD: marketCode,
    FID_RANK_SORT_CLS_CODE: sort,
    FID_DIV_CLS_CODE: "0",
    FID_TRGT_CLS_CODE: "0",
    FID_TRGT_EXLS_CLS_CODE: "0",
    FID_INPUT_PRICE_1: "",
    FID_INPUT_PRICE_2: "",
  }, token);
}

/** 공식 샘플 [국내주식-139] 시간외 거래량 순위. */
export function fetchOvertimeVolumeRanking(token: string, market = "J", marketCode = "0000", sort = "2") {
  return getRows("/uapi/domestic-stock/v1/ranking/overtime-volume", "FHPST02350000", {
    FID_COND_MRKT_DIV_CODE: market, FID_COND_SCR_DIV_CODE: "20235", FID_INPUT_ISCD: marketCode,
    FID_RANK_SORT_CLS_CODE: sort, FID_INPUT_PRICE_1: "", FID_INPUT_PRICE_2: "", FID_VOL_CNT: "", FID_TRGT_CLS_CODE: "", FID_TRGT_EXLS_CLS_CODE: "",
  }, token);
}

/** 공식 샘플 [국내주식-138] 시간외 등락률 순위. */
export function fetchOvertimeFluctuationRanking(token: string, market = "J", marketCode = "0000", sort = "2") {
  return getRows("/uapi/domestic-stock/v1/ranking/overtime-fluctuation", "FHPST02340000", {
    FID_COND_MRKT_DIV_CODE: market, FID_MRKT_CLS_CODE: "", FID_COND_SCR_DIV_CODE: "20234", FID_INPUT_ISCD: marketCode,
    FID_DIV_CLS_CODE: sort, FID_INPUT_PRICE_1: "", FID_INPUT_PRICE_2: "", FID_VOL_CNT: "", FID_TRGT_CLS_CODE: "", FID_TRGT_EXLS_CLS_CODE: "",
  }, token);
}

/** 공식 샘플 [국내주식-111] 당사 신용가능종목. */
export function fetchCreditByCompany(token: string, market = "J", marketCode = "0000", sort = "1", selectable = "0") {
  return getRows("/uapi/domestic-stock/v1/quotations/credit-by-company", "FHPST04770000", {
    FID_RANK_SORT_CLS_CODE: sort, FID_SLCT_YN: selectable, FID_INPUT_ISCD: marketCode, FID_COND_SCR_DIV_CODE: "20477", FID_COND_MRKT_DIV_CODE: market,
  }, token);
}

/** 공식 샘플 [국내주식-196] 매물대·거래비중. */
export function fetchPriceBarTradeRatio(token: string, code: string, market = "J", hour = "") {
  return getRows("/uapi/domestic-stock/v1/quotations/pbar-tratio", "FHPST01130000", { FID_COND_MRKT_DIV_CODE: market, FID_INPUT_ISCD: code, FID_COND_SCR_DIV_CODE: "20113", FID_INPUT_HOUR_1: hour }, token);
}

/** 공식 [국내주식-?] 당사매매종목 상위. 매도·매수 체결량 집중도를 후보 신호로 사용합니다. */
export function fetchTradedByCompany(token: string, market = "J", divCode = "0", sort = "0", startDate = "", endDate = "", marketCode = "0000", priceFrom = "", priceTo = "") {
  return getRows("/uapi/domestic-stock/v1/ranking/traded-by-company", "FHPST01860000", {
    fid_cond_mrkt_div_code: market, fid_div_cls_code: divCode, fid_rank_sort_cls_code: sort,
    fid_input_date_1: startDate, fid_input_date_2: endDate, fid_input_iscd: marketCode,
    fid_aply_rang_prc_1: priceFrom, fid_aply_rang_prc_2: priceTo,
    fid_trgt_exls_cls_code: "0", fid_cond_scr_div_code: "20186", fid_trgt_cls_code: "0", fid_aply_rang_vol: "0",
  }, token);
}

/** 공식 [국내주식-?] 체결금액별 매매비중. */
export function fetchTradeParticipationByAmount(token: string, code: string, market = "J", screen = "11119") {
  return getRows("/uapi/domestic-stock/v1/quotations/tradprt-byamt", "FHKST111900C0", {
    fid_cond_mrkt_div_code: market, fid_cond_scr_div_code: screen, fid_input_iscd: code,
  }, token);
}

/** 공식 국내주식-195 당사 대주가능 종목. 대주·공매도 후보 필터용입니다. */
export function fetchLendableByCompany(token: string, code = "", exchange = "00", lendableOnly = "Y", inquiry = "0") {
  return getRows("/uapi/domestic-stock/v1/quotations/lendable-by-company", "CTSC2702R", {
    EXCG_DVSN_CD: exchange,
    PDNO: code,
    THCO_STLN_PSBL_YN: lendableOnly,
    INQR_DVSN_1: inquiry,
    CTX_AREA_FK200: "",
    CTX_AREA_NK100: "",
  }, token);
}
