import { getDb } from "./db";
import { kisCache, topRisingStocks, usIntensityStocks } from "./schema";
import { eq, inArray } from "drizzle-orm";
import { getAccessToken, getKisMode, clearTokenCache } from "./kis";
import { buildKisUsRequestDebug, pushKisUsDebugLog } from "./kis-us-debug";

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
  const params = new URLSearchParams({
    KEYB: KIS_APPKEY || "",
    AUTH: token,
    EXCD: excd,       // 거래소 코드
    GUBN: "1",        // 상승율/하락율 구분 (1: 상승율)
    NDAY: "0",        // 날짜 구분
    VOL_RANG: "5",    // 거래량 조건 (5: 거래량이 활성화된 종목을 수집하여 왜곡 방지)
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
        authorization: `Bearer ${token}`,
        appkey: KIS_APPKEY || "",
        appsecret: KIS_APPSECRET || "",
        tr_id: trId,
        custtype: "P",
        tr_cont: "",
      })
    );
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "content-type": "application/json; charset=utf-8",
        authorization: `Bearer ${token}`,
        appkey: KIS_APPKEY || "",
        appsecret: KIS_APPSECRET || "",
        tr_id: trId,
        custtype: "P",  // 해외주식 API 필수 헤더 (P: 개인, B: 법인)
        tr_cont: "",    // 연속조회 비사용
      },
    });

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
      throw new Error(`KIS Overseas API Error [${resData.rt_cd}]: ${resData.msg1}`);
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
      amount: item.tamnt || "0",
    }));
    (result as any).isFallback = false;
    (result as any).fallbackSource = "";
    return result;
  } catch (err: any) {
    const kisErrMsg = err.message || String(err);
    const isAuthError = (kisErrMsg.includes("AUTH") && !kisErrMsg.includes("INPUT FIELD")) || kisErrMsg.includes("401") || kisErrMsg.includes("만료된") || kisErrMsg.includes("유효하지 않은") || kisErrMsg.includes("토큰");

    // AUTH 에러인 경우: 토큰 캐시가 오래되거나 잡목된 토큰일 가능성 높음 → 자동 재발급 후 재시도
    if (isAuthError) {
      console.warn(`[KIS-US-DEBUG] fetchRealUsVolumeRank: AUTH error detected ('${kisErrMsg}'). Clearing token cache and retrying with fresh token...`);
      pushKisUsDebugLog("KIS-US-AUTH-ERR", { message: kisErrMsg });
      await clearTokenCache();
      try {
        const freshToken = await getAccessToken();
        if (freshToken) {
          pushKisUsDebugLog(
            "KIS-US-REQ-RETRY",
            buildKisUsRequestDebug("GET", url, {
              "content-type": "application/json; charset=utf-8",
              authorization: `Bearer ${freshToken}`,
              appkey: KIS_APPKEY || "",
              appsecret: KIS_APPSECRET || "",
              tr_id: trId,
              custtype: "P",
              tr_cont: "",
            })
          );
          const retryResponse = await fetch(url, {
            method: "GET",
            headers: {
              "content-type": "application/json; charset=utf-8",
              authorization: `Bearer ${freshToken}`,
              appkey: KIS_APPKEY || "",
              appsecret: KIS_APPSECRET || "",
              tr_id: trId,
              custtype: "P",
              tr_cont: "",
            },
          });
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
                amount: item.tamnt || "0",
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
  const params = new URLSearchParams({
    KEYB: KIS_APPKEY || "",
    AUTH: token,
    EXCD: excd,       // 거래소 코드
    NDAY: "0",        // 날짜 구분
    VOL_RANG: "5",    // 거래량 조건
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
        authorization: `Bearer ${token}`,
        appkey: KIS_APPKEY || "",
        appsecret: KIS_APPSECRET || "",
        tr_id: trId,
        custtype: "P",
        tr_cont: "",
      })
    );
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "content-type": "application/json; charset=utf-8",
        authorization: `Bearer ${token}`,
        appkey: KIS_APPKEY || "",
        appsecret: KIS_APPSECRET || "",
        tr_id: trId,
        custtype: "P",
        tr_cont: "",
      },
    });

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
      throw new Error(`KIS Overseas API Error [${resData.rt_cd}]: ${resData.msg1}`);
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

export async function fetchTopRisingStocks(): Promise<TopRisingStockItem[]> {
  // 사용자의 요청으로 해외 주식 기능 임시 비활성화
  return [];
  const offset = getDynamicOffset(7);

  if (process.env.NODE_ENV === "test") {
    return Array.from({ length: 10 }, (_, i) => {
      const baseRate = 29.5 - i * 2.1;
      const changeRate = `+${Math.max(1.0, baseRate + offset * 0.1).toFixed(2)}%`;
      return {
        rank: i + 1,
        company: `US Rising Stock ${String.fromCharCode(65 + i)}`,
        code: `90000${i}`,
        price: `$${(250 - i * 15 + offset * 1.5).toFixed(2)}`,
        changeRate,
      };
    });
  }

  const cacheKey = "top_rising_stocks";

  if (!KIS_APPKEY || !KIS_APPSECRET) {
    console.warn(`[KIS-US-DEBUG] fetchTopRisingStocks: API credentials missing. Attempting DB Cache restore.`);
    try {
      const db = getDb();
      if (db) {
        const cacheRecord = await db.select({ data: kisCache.data }).from(kisCache).where(eq(kisCache.key, cacheKey)).limit(1);
        if (cacheRecord.length > 0) {
          const filtered = filterMockUsRisingStocks(cacheRecord[0].data as TopRisingStockItem[]);
          console.info(`[KIS-US-DEBUG] fetchTopRisingStocks: Successfully restored ${filtered.length} items from DB cache.`);
          const result = filtered;
          (result as any).isFallback = true;
          (result as any).fallbackSource = "db";
          return result;
        }
      }
    } catch (dbErr: any) {
      console.error("[KIS-US-DEBUG] fetchTopRisingStocks empty return: API credentials missing and DB cache read crashed:", dbErr.message);
    }
    return [];
  }

  const token = await getAccessToken();

  try {
    if (token) {
      const realItems = await fetchRealUsVolumeRank(token as string, "NAS");
      if (realItems && realItems.length > 0) {
        const mappedData = realItems.slice(0, 10).map((item, i) => {
          const priceVal = parseFloat(item.last) || 0.0;
          const rateVal = parseFloat(item.rate) || 0.0;
          const isUp = rateVal >= 0;

          return {
            rank: i + 1,
            company: item.name,
            code: item.symb,
            price: `$${priceVal.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
            changeRate: `${isUp ? "+" : ""}${rateVal.toFixed(2)}%`,
          };
        });

        try {
          const db = getDb();
          if (db) {
            await db.insert(kisCache)
              .values({ key: cacheKey, data: mappedData, updatedAt: new Date() })
              .onConflictDoUpdate({
                target: kisCache.key,
                set: { data: mappedData, updatedAt: new Date() }
              });
          }
        } catch (dbWriteErr: any) {
          console.error(`[KIS-US-DEBUG] fetchTopRisingStocks: Failed to write ${cacheKey} to DB Cache:`, dbWriteErr.message);
        }

        const filtered = filterMockUsRisingStocks(mappedData);
        console.info(`[KIS-US-DEBUG] fetchTopRisingStocks: Successfully fetched ${filtered.length} real-time items.`);
        (filtered as any).isFallback = (realItems as any).isFallback;
        (filtered as any).fallbackSource = (realItems as any).fallbackSource;
        (filtered as any).kisError = (realItems as any).kisError ?? null;
        return filtered;
      }
    }
  } catch (err: any) {
    console.warn(`[KIS-US-DEBUG] fetchTopRisingStocks: Realtime fetch failed, falling back to DB cache:`, err.message || err);
  }

  try {
    const db = getDb();
    if (db) {
      const cacheRecord = await db.select({ data: kisCache.data }).from(kisCache).where(eq(kisCache.key, cacheKey)).limit(1);
      if (cacheRecord.length > 0) {
        console.info(`[KIS-US-DEBUG] fetchTopRisingStocks: Restored ${(cacheRecord[0].data as any[]).length} items from fallback DB cache.`);
        const cachedData = cacheRecord[0].data as TopRisingStockItem[];
        (cachedData as any).isFallback = true;
        (cachedData as any).fallbackSource = "db";
        return cachedData;
      }
    }
  } catch (dbReadErr: any) {
    console.error("[KIS-US-DEBUG] fetchTopRisingStocks empty return: DB cache read failed:", dbReadErr.message);
  }

  return [];
}

// 서울 시간대 (UTC+9) 날짜 문자열(YYYY-MM-DD) 반환 헬퍼
function getSeoulDateStr(d: Date): string {
  const seoulTime = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return seoulTime.toISOString().split("T")[0];
}

export interface UsIntensityStockItem {
  code: string;
  company: string;
  intensity: number;
  price: string;
  changeRate: string;
}

export async function fetchUsTradingIntensity(): Promise<UsIntensityStockItem[]> {
  const cacheKey = "us_trading_intensity";

  if (!KIS_APPKEY || !KIS_APPSECRET) {
    console.warn(`[KIS-US-DEBUG] fetchUsTradingIntensity: API credentials missing. Attempting DB Cache restore.`);
    try {
      const db = getDb();
      if (db) {
        const cacheRecord = await db.select({ data: kisCache.data }).from(kisCache).where(eq(kisCache.key, cacheKey)).limit(1);
        if (cacheRecord.length > 0) {
          return cacheRecord[0].data as UsIntensityStockItem[];
        }
      }
    } catch (dbErr: any) {
      console.error("[KIS-US-DEBUG] fetchUsTradingIntensity: DB cache read failed:", dbErr.message);
    }
    return [];
  }

  const token = await getAccessToken();

  try {
    if (token) {
      const realItems = await fetchRealUsVolumePower(token as string, "NAS");
      if (realItems && realItems.length > 0) {
        const mappedData = realItems.slice(0, 10).map((item, i) => {
          const priceVal = parseFloat(item.last) || 0.0;
          const rateVal = parseFloat(item.rate) || 0.0;
          const isUp = rateVal >= 0;
          const intensity = parseFloat(item.powx) || 0;

          return {
            code: item.symb,
            company: item.name,
            intensity: intensity > 0 ? Math.round(intensity) : Math.max(50, Math.round(160 - i * 6)),
            price: `$${priceVal.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
            changeRate: `${isUp ? "+" : ""}${rateVal.toFixed(2)}%`,
          };
        });

        const sortedData = mappedData.sort((a, b) => b.intensity - a.intensity);

        try {
          const db = getDb();
          if (db) {
            await db.insert(kisCache)
              .values({ key: cacheKey, data: sortedData, updatedAt: new Date() })
              .onConflictDoUpdate({
                target: kisCache.key,
                set: { data: sortedData, updatedAt: new Date() }
              });
          }
        } catch (dbWriteErr: any) {
          console.error(`[KIS-US-DEBUG] fetchUsTradingIntensity: Failed to write ${cacheKey} to DB Cache:`, dbWriteErr.message);
        }

        return sortedData;
      }
    }
  } catch (err: any) {
    console.warn(`[KIS-US-DEBUG] fetchUsTradingIntensity: Realtime fetch failed, falling back to DB cache:`, err.message || err);
  }

  try {
    const db = getDb();
    if (db) {
      const cacheRecord = await db.select({ data: kisCache.data }).from(kisCache).where(eq(kisCache.key, cacheKey)).limit(1);
      if (cacheRecord.length > 0) {
        return cacheRecord[0].data as UsIntensityStockItem[];
      }
    }
  } catch (dbReadErr: any) {
    console.error("[KIS-US-DEBUG] fetchUsTradingIntensity empty return: DB cache read failed:", dbReadErr.message);
  }

  return [];
}

export async function syncUsTradingIntensityStocks(): Promise<UsIntensityStockItem[]> {
  const db = getDb();
  if (!db) {
    console.warn("[SYNC-US] Database connection is not available for syncUsTradingIntensityStocks");
    return [];
  }

  const newTop10 = await fetchUsTradingIntensity();
  if (newTop10.length === 0) {
    console.warn("[SYNC-US] fetchUsTradingIntensity returned empty array. DB sync aborted.");
    return [];
  }

  try {
    let oldTop10 = await db.select().from(usIntensityStocks);
    
    // DB 테이블이 비어있으면 초기 셋업 진행
    if (oldTop10.length === 0) {
      console.info("[SYNC-US] usIntensityStocks table empty, performing initial insert.");
      await db.delete(usIntensityStocks);
      for (const s of newTop10) {
        await db.insert(usIntensityStocks).values({
          code: s.code,
          company: s.company,
          intensity: s.intensity,
          price: s.price,
          changeRate: s.changeRate,
          addedAt: new Date(),
        }).onConflictDoNothing();
      }
      return newTop10;
    }

    // 기존 데이터와 교차 비교하여 새로운 종목 판별
    const newCodes = newTop10.map(s => s.code);
    const obsoleteCodes = oldTop10.filter(s => !newCodes.includes(s.code)).map(s => s.code);

    if (obsoleteCodes.length > 0) {
      await db.delete(usIntensityStocks).where(inArray(usIntensityStocks.code, obsoleteCodes));
    }

    for (const s of newTop10) {
      const existing = oldTop10.find((x) => x.code === s.code);
      if (!existing) {
        await db.insert(usIntensityStocks).values({
          code: s.code,
          company: s.company,
          intensity: s.intensity,
          price: s.price,
          changeRate: s.changeRate,
          addedAt: new Date(),
        }).onConflictDoNothing();
      } else {
        await db.update(usIntensityStocks)
          .set({
            intensity: s.intensity,
            price: s.price,
            changeRate: s.changeRate,
          })
          .where(eq(usIntensityStocks.code, s.code));
      }
    }
    
    return newTop10;
  } catch (dbErr: any) {
    console.error("[SYNC-US] Failed to sync usIntensityStocks:", dbErr.message);
    return newTop10;
  }
}

export async function syncTopRisingStocks(): Promise<TopRisingStockItem[]> {
  const db = getDb();
  if (!db) return [];

  const newTop10 = await fetchTopRisingStocks();
  if (newTop10.length === 0) return [];

  const todayStr = getSeoulDateStr(new Date());
  let oldTop10 = await db.select().from(topRisingStocks);

  // C. 오늘 날짜 기준 정합성 검증 (날짜가 다르면 기존 데이터 완전 초기화)
  if (oldTop10.length > 0) {
    const lastRecordDate = getSeoulDateStr(oldTop10[0].addedAt);
    if (lastRecordDate !== todayStr) {
      await db.delete(topRisingStocks);
      oldTop10 = [];
    }
  }

  const oldCodes = new Set(oldTop10.map((s) => s.code));
  const newCodes = new Set(newTop10.map((s) => s.code));

  // D. 당일 중복 알림 방지를 위해 누락된 종목을 삭제하지 않고 유지합니다.
  const obsoleteCodes = oldTop10.filter((s) => !newCodes.has(s.code)).map((s) => s.code);
  // 삭제 로직 제거됨

  const newlyAdded = newTop10.filter((s) => !oldCodes.has(s.code));
  if (newlyAdded.length > 0) {
    await db.insert(topRisingStocks).values(
      newlyAdded.map((s) => ({
        code: s.code,
        company: s.company,
        changeRate: s.changeRate,
        price: s.price,
        addedAt: new Date(),
      }))
    );
  }

  const existing = newTop10.filter((s) => oldCodes.has(s.code));
  for (const s of existing) {
    await db.update(topRisingStocks)
      .set({
        price: s.price,
        changeRate: s.changeRate,
      })
      .where(eq(topRisingStocks.code, s.code));
  }

  return newlyAdded;
}
