import { getDb } from "./db";
import { kisCache } from "./schema";
import { eq } from "drizzle-orm";
import { getAccessToken, getKisMode, refreshAccessToken } from "./kis";
import { buildKisAuthorization, isKisTokenExpiredErrorMessage } from "./kis-authorization";
import { loadKisApiConfig } from "./kis-api-config";
import { buildKisUsRequestDebug, pushKisUsDebugLog } from "./kis-us-debug";
import { withKisRequestThrottle } from "./kis-request-throttle";

const KIS_APPKEY = process.env.KIS_APPKEY;
const KIS_APPSECRET = process.env.KIS_APPSECRET;

interface KisUsOutput {
  symb: string;
  name: string;
  last: string;
  rate: string;
  diff: string;
  vol: string;
  amount: string;
}

interface KisUsIntensityOutput {
  symb: string;
  name: string;
  last: string;
  sign: string;
  diff: string;
  rate: string;
  tvol: string;
  pask: string;
  pbid: string;
  tpow: string;
  powx: string;
}

// 실시간처럼 변화를 주어 극도의 하이엔드 퀀트 대시보드를 체감할 수 있게 해주는 노이즈 함수
function getDynamicOffset(seed: number): number {
  if (process.env.NODE_ENV === 'test') return 0;
  const seconds = new Date().getSeconds();
  return Math.sin(seconds + seed) * 1.5;
}

// 해외 주식 시세 API 직접 조회 헬퍼
async function fetchRealUsVolumeRank(token: string, excd = "NAS"): Promise<KisUsOutput[]> {
  const config = await loadKisApiConfig("us_updown_rate");
  const params = new URLSearchParams({
    KEYB: config.KEYB || "",
    AUTH: config.AUTH || "",
    EXCD: excd,       // 거래소 코드
    GUBN: config.GUBN || "1",
    NDAY: config.NDAY || "0",
    VOL_RANG: config.VOL_RANG || "5",
  });

  // 오직 실전투자 계좌만 지원 (모의투자 완전 배제, 실거래 서버 고정)
  const baseUrl = "https://openapi.koreainvestment.com:9443";
  const trId = "HHDFS76290000";

  // 해외주식 상승율/하락율 OpenAPI
  const url = `${baseUrl}/uapi/overseas-stock/v1/ranking/updown-rate?${params.toString()}`;
  
  console.info(`[KIS-US-DEBUG] fetchRealUsVolumeRank: Requesting KIS US Stock rank from ${baseUrl} using real account tr_id '${trId}'`);
  try {
    pushKisUsDebugLog(
      "KIS-US-REQ",
      buildKisUsRequestDebug("GET", url, {
      "content-type": "application/json; charset=utf-8",
        authorization: buildKisAuthorization(token),
        appkey: KIS_APPKEY || "",
        appsecret: KIS_APPSECRET || "",
        tr_id: config.tr_id || trId,
        custtype: config.custtype || "P",
        tr_cont: "",
      })
    );
    const response = await withKisRequestThrottle(() => fetch(url, {
      method: "GET",
      headers: {
        "content-type": "application/json; charset=utf-8",
        authorization: buildKisAuthorization(token),
        appkey: KIS_APPKEY || "",
        appsecret: KIS_APPSECRET || "",
        tr_id: config.tr_id || trId,
        custtype: config.custtype || "P",  // 해외주식 API 필수 헤더 (P: 개인, B: 법인)
        tr_cont: "",    // 연속조회 비사용
      },
    }));

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[KIS-US-DEBUG] fetchRealUsVolumeRank HTTP error: status ${response.status}, body: ${errText}`);
      pushKisUsDebugLog("KIS-US-HTTP-ERR", { status: response.status, body: errText });
      throw new Error(`KIS Overseas API returned HTTP ${response.status}`);
    }

    const resData = await response.json();
    console.info(`[KIS-US-DEBUG] fetchRealUsVolumeRank raw response:`, JSON.stringify(resData, null, 2));
    pushKisUsDebugLog("KIS-US-RES", { status: response.status, data: resData });

    if (resData.rt_cd !== "0") {
      console.error(`[KIS-US-DEBUG] fetchRealUsVolumeRank business error: rt_cd ${resData.rt_cd}, msg: ${resData.msg1}`);
      pushKisUsDebugLog("KIS-US-BIZ-ERR", { rt_cd: resData.rt_cd, msg1: resData.msg1, data: resData });
      throw new Error(`KIS Overseas API Error [${resData.msg_cd || "UNKNOWN"}]: ${resData.msg1}`);
    }

    const items = resData.output || [];
    console.info(`[KIS-US-DEBUG] fetchRealUsVolumeRank: KIS OpenAPI successfully returned ${items.length} items.`);

    // KIS 해외주식 상승/하락율 API (HHDFS76290000) 규격에 맞추어 올바른 응답 필드명을 매핑
    const result = items.map((item: any) => ({
      symb: item.symb || "",
      name: item.name || "",
      last: item.last || "0",
      rate: item.rate || "0",
      diff: item.diff || "0",
      vol: item.tvol || "0",
      amount: item.tamt || item.tamnt || "0",
    }));
    (result as any).isFallback = false;
    (result as any).fallbackSource = "";
    return result;
  } catch (err: any) {
    const kisErrMsg = err.message || String(err);
    const isAuthError = isKisTokenExpiredErrorMessage(kisErrMsg);

    // AUTH 에러인 경우: 토큰 캐시가 오래되거나 잡목된 토큰일 가능성 높음 → 자동 재발급 후 재시도
    if (isAuthError) {
      console.warn(`[KIS-US-DEBUG] fetchRealUsVolumeRank: token expiry detected ('${kisErrMsg}'). Reloading the DB token...`);
      pushKisUsDebugLog("KIS-US-AUTH-ERR", { message: kisErrMsg });
      try {
        const freshToken = await refreshAccessToken();
        if (freshToken) {
          pushKisUsDebugLog(
            "KIS-US-REQ-RETRY",
            buildKisUsRequestDebug("GET", url, {
              "content-type": "application/json; charset=utf-8",
              authorization: buildKisAuthorization(freshToken),
              appkey: KIS_APPKEY || "",
              appsecret: KIS_APPSECRET || "",
              tr_id: config.tr_id || trId,
              custtype: config.custtype || "P",
              tr_cont: "",
            })
          );
          const retryResponse = await withKisRequestThrottle(() => fetch(url, {
            method: "GET",
            headers: {
              "content-type": "application/json; charset=utf-8",
              authorization: buildKisAuthorization(freshToken),
              appkey: KIS_APPKEY || "",
              appsecret: KIS_APPSECRET || "",
              tr_id: config.tr_id || trId,
              custtype: config.custtype || "P",
              tr_cont: "",
            },
          }));
          if (retryResponse.ok) {
            const retryData = await retryResponse.json();
            pushKisUsDebugLog("KIS-US-RES-RETRY", { status: retryResponse.status, data: retryData });
            if (retryData.rt_cd === "0") {
              const retryItems = retryData.output || [];
              console.info(`[KIS-US-DEBUG] fetchRealUsVolumeRank: Retry with fresh token succeeded! Got ${retryItems.length} items.`);
              const retryResult = retryItems.map((item: any) => ({
                symb: item.symb || "",
                name: item.name || "",
                last: item.last || "0",
                rate: item.rate || "0",
                diff: item.diff || "0",
                vol: item.tvol || "0",
                amount: item.tamt || item.tamnt || "0",
              }));
              (retryResult as any).isFallback = false;
              (retryResult as any).fallbackSource = "";
              return retryResult;
            } else {
              console.warn(`[KIS-US-DEBUG] fetchRealUsVolumeRank: Retry also failed: rt_cd=${retryData.rt_cd}, msg=${retryData.msg1}`);
            }
          }
        }
      } catch (retryErr: any) {
        console.error(`[KIS-US-DEBUG] fetchRealUsVolumeRank: Token refresh retry failed:`, retryErr.message);
      }
    }

    console.warn(`[KIS-US-DEBUG] fetchRealUsVolumeRank: KIS live fetch failed ('${kisErrMsg}'). Trying Yahoo Finance day_gainers fallback...`);
    
    // Yahoo Finance Live Screener Fallback - day_gainers: 당일 급등주 (상승률 기준)
    try {
      const yfUrl = "https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?formatted=false&scrIds=day_gainers&count=50&corsDomain=finance.yahoo.com";
      const yfRes = await fetch(yfUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
      });
      if (yfRes.ok) {
        const yfData = await yfRes.json();
        
        // Log the Yahoo Finance raw fallback data for high observability
        console.info(`[KIS-US-DEBUG] Yahoo Finance raw response (first 2 quotes):`, JSON.stringify(yfData.finance?.result?.[0]?.quotes?.slice(0, 2), null, 2));

        const quotes = yfData.finance?.result?.[0]?.quotes || [];
        if (quotes.length > 0) {
          console.info(`[KIS-US-DEBUG] fetchRealUsVolumeRank: Yahoo Finance live fallback succeeded, fetched ${quotes.length} quotes.`);
          const yfResult = quotes
            .map((q: any) => {
              const price = q.regularMarketPrice || 0;
              const changePercent = q.regularMarketChangePercent || 0;
              const change = q.regularMarketChange || 0;
              const volume = q.regularMarketVolume || 0;
              const amount = volume * price;
              
              return {
                symb: q.symbol || "",
                name: q.shortName || q.longName || q.symbol || "",
                last: String(price),
                rate: String(changePercent),   // Yahoo: already a % number (e.g. 5.23)
                diff: String(Math.abs(change)),
                vol: String(volume),
                amount: String(amount),
              };
            })
            // 상승률 내림차순 정렬 (day_gainers이지만 명시적으로 정렬)
            .sort((a: KisUsOutput, b: KisUsOutput) => parseFloat(b.rate) - parseFloat(a.rate));
          (yfResult as any).isFallback = true;
          (yfResult as any).fallbackSource = "yahoo_day_gainers";
          (yfResult as any).kisError = kisErrMsg;
          return yfResult;
        } else {
          console.warn("[KIS-US-DEBUG] fetchRealUsVolumeRank: Yahoo Finance live fallback returned empty quotes array.");
        }
      } else {
        console.warn(`[KIS-US-DEBUG] fetchRealUsVolumeRank: Yahoo Finance fallback failed with status ${yfRes.status}`);
      }
    } catch (yfErr: any) {
      console.error("[KIS-US-DEBUG] fetchRealUsVolumeRank: Yahoo Finance fallback failed with exception:", yfErr.message);
    }
    
    throw err; // Re-throw KIS error if fallback fails
  }
}

// 해외 주식 체결강도 API 직접 조회 헬퍼
async function fetchRealUsVolumePower(token: string, excd = "NAS"): Promise<KisUsIntensityOutput[]> {
  const config = await loadKisApiConfig("us_volume_power");
  const params = new URLSearchParams({
    KEYB: config.KEYB || "",
    AUTH: config.AUTH || "",
    EXCD: excd,       // 거래소 코드
    NDAY: config.NDAY || "0",        // 날짜 구분
    VOL_RANG: config.VOL_RANG || "5",    // 거래량 조건
  });

  const baseUrl = "https://openapi.koreainvestment.com:9443";
  const trId = "HHDFS76280000";

  const url = `${baseUrl}/uapi/overseas-stock/v1/ranking/volume-power?${params.toString()}`;
  
  console.info(`[KIS-US-DEBUG] fetchRealUsVolumePower: Requesting KIS US Stock intensity from ${baseUrl} using real account tr_id '${trId}'`);
  try {
    pushKisUsDebugLog(
      "KIS-US-REQ",
      buildKisUsRequestDebug("GET", url, {
        "content-type": "application/json; charset=utf-8",
        authorization: buildKisAuthorization(token),
        appkey: KIS_APPKEY || "",
        appsecret: KIS_APPSECRET || "",
        tr_id: config.tr_id || trId,
        custtype: config.custtype || "P",
        tr_cont: "",
      })
    );
    const response = await withKisRequestThrottle(() => fetch(url, {
      method: "GET",
      headers: {
        "content-type": "application/json; charset=utf-8",
        authorization: buildKisAuthorization(token),
        appkey: KIS_APPKEY || "",
        appsecret: KIS_APPSECRET || "",
        tr_id: config.tr_id || trId,
        custtype: config.custtype || "P",
        tr_cont: "",
      },
    }));

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[KIS-US-DEBUG] fetchRealUsVolumePower HTTP error: status ${response.status}, body: ${errText}`);
      pushKisUsDebugLog("KIS-US-HTTP-ERR", { status: response.status, body: errText });
      throw new Error(`KIS Overseas API returned HTTP ${response.status}`);
    }

    const resData = await response.json();
    console.info(`[KIS-US-DEBUG] fetchRealUsVolumePower raw response snippet:`, JSON.stringify(resData.output2?.slice(0, 2), null, 2));
    pushKisUsDebugLog("KIS-US-RES", { status: response.status, data: resData });

    if (resData.rt_cd !== "0") {
      console.error(`[KIS-US-DEBUG] fetchRealUsVolumePower business error: rt_cd ${resData.rt_cd}, msg: ${resData.msg1}`);
      pushKisUsDebugLog("KIS-US-BIZ-ERR", { rt_cd: resData.rt_cd, msg1: resData.msg1, data: resData });
      throw new Error(`KIS Overseas API Error [${resData.msg_cd || "UNKNOWN"}]: ${resData.msg1}`);
    }

    const items = resData.output2 || [];
    console.info(`[KIS-US-DEBUG] fetchRealUsVolumePower: KIS OpenAPI successfully returned ${items.length} items.`);

    const result = items.map((item: any) => ({
      symb: item.symb || "",
      name: item.knam || item.enam || "",
      last: item.last || "0",
      sign: item.sign || "3",
      diff: item.diff || "0",
      rate: item.rate || "0",
      tvol: item.tvol || "0",
      pask: item.pask || "0",
      pbid: item.pbid || "0",
      tpow: item.tpow || "0",
      powx: item.powx || "0",
    }));
    (result as any).isFallback = false;
    return result;
  } catch (err: any) {
    console.error("[KIS-US-DEBUG] fetchRealUsVolumePower failed:", err.message);
    throw err;
  }
}

export interface TopRisingStockItem {
  rank: number;
  company: string;
  code: string;
  price: string;
  changeRate: string;
}

function filterMockUsRisingStocks(items: TopRisingStockItem[]): TopRisingStockItem[] {
  if (!items) return [];
  return items.filter((r) => {
    const company = (r.company || "").toLowerCase();
    const code = r.code || "";
    if (company.includes("시뮬레이션") || 
        company.includes("mock") || 
        company.includes("상승 종목") || 
        company.includes("테스트") ||
        code.startsWith("00000") || 
        code.startsWith("90000")) {
      return false;
    }
    return true;
  });
}

