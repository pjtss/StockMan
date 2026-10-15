import { kisRequest, type KisResponse } from "./kis-request-framework";

const BASE_URL = "https://openapi.koreainvestment.com:9443";
const PATH = "/uapi/domestic-stock/v1/ksdinfo/list-info";
const TR_ID = "HHKDB669107C0";

export type KisIpoListingScheduleQuery = {
  fromDate: string;
  toDate: string;
  stockCode?: string;
  continuationState?: string;
};

export type KisIpoListingScheduleRow = {
  list_dt?: string;
  sht_cd?: string;
  isin_name?: string;
  stk_kind?: string;
  issue_type?: string;
  issue_stk_qty?: string;
  tot_issue_stk_qty?: string;
  issue_price?: string;
};

export type KisIpoListingScheduleBody = {
  rt_cd?: string;
  msg_cd?: string;
  msg1?: string;
  output1?: KisIpoListingScheduleRow[];
  [key: string]: unknown;
};

/** 조회 응답을 가공하지 않고 HTTP 응답·원문·파싱 결과 그대로 반환한다. */
export function fetchKisIpoListingSchedule(
  token: string,
  query: KisIpoListingScheduleQuery,
): Promise<KisResponse<KisIpoListingScheduleBody>> {
  const url = new URL(`${BASE_URL}${PATH}`);
  url.searchParams.set("SHT_CD", query.stockCode?.trim() ?? "");
  url.searchParams.set("T_DT", query.toDate);
  url.searchParams.set("F_DT", query.fromDate);
  url.searchParams.set("CTS", query.continuationState?.trim() ?? "");

  return kisRequest<KisIpoListingScheduleBody>({
    url,
    token,
    trId: TR_ID,
    debug: { feature: "ipo-listing-schedule", market: "KR" },
  });
}
