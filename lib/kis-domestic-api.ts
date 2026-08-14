import { buildKisAuthorization } from "./kis-authorization";
import { KIS_APPKEY, KIS_APPSECRET } from "./kis-runtime";
import type { KisOutput } from "./kis-types";

const BASE_URL = "https://openapi.koreainvestment.com:9443";

export type DomesticRankingRows = KisOutput[] & { diagnostics?: { status: number; rtCd: string | null; msgCd: string | null; msg1: string | null; recordCount: number; rawTextPreview: string } };
async function requestRanking(path: string, trId: string, params: Record<string, string>, token: string): Promise<DomesticRankingRows> {
  const url = `${BASE_URL}${path}?${new URLSearchParams(params).toString()}`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "content-type": "application/json",
      Authorization: buildKisAuthorization(token),
      appkey: KIS_APPKEY || "",
      appsecret: KIS_APPSECRET || "",
      tr_id: trId,
    },
  });
  if (!response.ok) throw new Error(`KIS API returned HTTP ${response.status}`);
  const rawText = await response.text();
  const data = JSON.parse(rawText);
  if (data.rt_cd !== "0") throw new Error(`KIS API Error [${data.rt_cd}]: ${data.msg1}`);
  const rows = (data.output || []) as DomesticRankingRows;
  rows.diagnostics = { status: response.status, rtCd: data.rt_cd ?? null, msgCd: data.msg_cd ?? null, msg1: data.msg1 ?? null, recordCount: rows.length, rawTextPreview: rawText.slice(0, 2000) };
  return rows;
}

export function fetchDomesticVolumePower(token: string) {
  return requestRanking("/uapi/domestic-stock/v1/ranking/volume-power", "FHPST01680000", {
    FID_COND_MRKT_DIV_CODE: "J", FID_COND_SCR_DIV_CODE: "20168", FID_INPUT_ISCD: "0000",
    FID_DIV_CLS_CODE: "0", FID_BLNG_CLS_CODE: "0", FID_TRGT_CLS_CODE: "111111111",
    FID_TRGT_EXLS_CLS_CODE: "000000000", FID_INPUT_PRICE_1: "0", FID_INPUT_PRICE_2: "0",
    FID_VOL_CNT: "0", FID_INPUT_CNT_1: "0", FID_INPUT_CNT_2: "0",
    FID_STOC_PRE_KYWD_CLS_CODE: "00", FID_SUB_AND_DO_CLS_CODE: "N",
  }, token);
}

export function fetchDomesticFluctuation(token: string) {
  return requestRanking("/uapi/domestic-stock/v1/ranking/fluctuation", "FHPST01700000", {
    FID_COND_MRKT_DIV_CODE: "J", FID_COND_SCR_DIV_CODE: "20170", FID_INPUT_ISCD: "0000",
    FID_DIV_CLS_CODE: "0", FID_RANK_SORT_CLS_CODE: "0", FID_PRC_CLS_CODE: "0",
    FID_TRGT_CLS_CODE: "000000000", FID_TRGT_EXLS_CLS_CODE: "000000000",
    FID_INPUT_PRICE_1: "0", FID_INPUT_PRICE_2: "0", FID_RSFL_RATE1: "0", FID_RSFL_RATE2: "0", FID_VOL_CNT: "0",
    FID_INPUT_CNT_1: "0", FID_INPUT_CNT_2: "0", FID_BLNG_CLS_CODE: "0",
  }, token);
}

/** KIS 국내주식 거래대금순위. 결과는 거래대금 내림차순으로 반환된다. */
export function fetchDomesticTradeValueRanking(token: string) {
  return requestRanking("/uapi/domestic-stock/v1/quotations/volume-rank", "FHPST01710000", {
    FID_COND_MRKT_DIV_CODE: "J", FID_COND_SCR_DIV_CODE: "20171", FID_INPUT_ISCD: "0000",
    FID_DIV_CLS_CODE: "0", FID_BLNG_CLS_CODE: "0", FID_TRGT_CLS_CODE: "111111111",
    FID_TRGT_EXLS_CLS_CODE: "000000000", FID_INPUT_PRICE_1: "0", FID_INPUT_PRICE_2: "0",
    FID_VOL_CNT: "0", FID_INPUT_CNT_1: "0", FID_INPUT_CNT_2: "0",
    FID_STOC_PRE_KYWD_CLS_CODE: "00", FID_SUB_AND_DO_CLS_CODE: "N",
  }, token).then((rows) => rows.sort((a, b) => Number((b as any).acml_tr_pbmn ?? (b as any).acml_tr_pbmn_amt ?? 0) - Number((a as any).acml_tr_pbmn ?? (a as any).acml_tr_pbmn_amt ?? 0)));
}
