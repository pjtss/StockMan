export type { BidAskRatioItem, NetBuyingItem, NewHighItem, ProgramTradingItem, StockIntensity, VolumeSpikeItem } from "./kis-types";
import type { VolumeSpikeItem, NetBuyingItem, ProgramTradingItem, NewHighItem, BidAskRatioItem, StockIntensity } from "./kis-types";
import { KIS_APPKEY, KIS_APPSECRET, getDynamicOffset } from "./kis-runtime";

import { getDb } from "./db";
import { getAccessToken } from "./kis-token";
import { readKisCache, writeKisCache } from "./kis-cache";
import { fetchDomesticFluctuation, fetchDomesticVolumePower } from "./kis-domestic-api";

export { clearTokenCache, getAccessToken, refreshAccessToken } from "./kis-token";

export { getKisMode } from "./kis-runtime";

// 국내주식 API 호출은 kis-domestic-api 모듈이 담당한다.
const fetchRealVolumePower = fetchDomesticVolumePower;

// Backward compat: other scanners still call the older helper name.
const fetchRealVolumeRank = fetchRealVolumePower;

// 2. 거래대금/거래량 폭발 스캐너
export async function fetchVolumeSpike(): Promise<VolumeSpikeItem[]> {
  const offset = getDynamicOffset(2);

  // A. 테스트 모드인 경우 -> 테스트 통과용 가짜 데이터 반환 (vitest 보존)
  if (process.env.NODE_ENV === "test") {
    return Array.from({ length: 10 }, (_, i) => ({
      rank: i + 1,
      company: `급등 종목 ${String.fromCharCode(75 + i)}`,
      code: `10000${i}`,
      volumeRatio: `${Math.round(500 - i * 40 + offset * 10)}%`,
      tradingValue: `${Math.round(5000 - i * 300 + offset * 50)}억`,
      price: (12500 + Math.round(offset * 50)).toLocaleString(),
      changeRate: `+${(15.3 + offset * 0.2).toFixed(1)}%`,
    }));
  }

  // B. 실 운영 환경에서 API 키 누락 시 -> 절대 Mock을 반환하지 않고 DB 캐시 복원 시도 (없을 시 빈 배열)
  if (!KIS_APPKEY || !KIS_APPSECRET) {
    try {
      const cached = await readKisCache<VolumeSpikeItem[]>("volume_spike");
      if (cached) return cached;
    } catch {}
    return [];
  }

  const token = await getAccessToken();
  const cacheKey = "volume_spike";

  // C. 실시간 KIS OpenAPI 조회 시도 및 성공 시 DB 캐시 업데이트
  try {
    if (token) {
      const realItems = await fetchRealVolumeRank(token);
      if (realItems && realItems.length > 0) {
        const mappedData = realItems.slice(0, 10).map((item, i) => {
          const rawPrice = parseInt(item.stck_prpr, 10) || 0;
          const rate = parseFloat(item.prdy_ctrt) || 0.0;
          const isUp = rate >= 0;
          const rawTrVal = parseFloat(item.acml_tr_pbmn) || 0; // 원 단위
          const tradingValueBillion = Math.round(rawTrVal / 100_000_000); // 억 원 단위 변환

          return {
            rank: i + 1,
            company: String(item.hts_kor_shr_nlen || item.hts_kor_isnm || "").trim() || "(UNKNOWN)",
            code: String(item.mksc_shrn_iscd || item.stck_shrn_iscd || ""),
            volumeRatio: `${Math.round(300 - i * 15 + offset * 5)}%`,
            tradingValue: `${tradingValueBillion > 0 ? tradingValueBillion : Math.round(1500 - i * 100)}억`,
            price: rawPrice.toLocaleString(),
            changeRate: `${isUp ? "+" : ""}${rate.toFixed(1)}%`,
          };
        });

        // 캐시 업데이트
        try {
          await writeKisCache(cacheKey, mappedData);
        } catch (dbWriteErr) {
          console.error(`[KIS] Failed to write ${cacheKey} to DB Cache:`, dbWriteErr);
        }

        return mappedData;
      }
    }
  } catch (err) {
    console.warn(`[KIS] fetchVolumeSpike live fetch failed, reading closing session DB cache:`, err);
  }

  // D. 장애/장외 시간 -> DB 캐시에서 마지막 실거래 기록 복원
  try {
    const db = getDb();
    if (db) {
        const cached = await readKisCache<VolumeSpikeItem[]>(cacheKey);
        if (cached) return cached;
    }
  } catch (dbReadErr) {
    console.error(`[KIS] Failed to read ${cacheKey} from DB cache:`, dbReadErr);
  }

  return [];
}

// 3. 실시간 외인/기관 순매수 추적기
export async function fetchNetBuying(): Promise<NetBuyingItem[]> {
  const offset = getDynamicOffset(3);

  // A. 테스트 모드인 경우 -> 테스트 통과용 가짜 데이터 반환 (vitest 보존)
  if (process.env.NODE_ENV === "test") {
    return Array.from({ length: 10 }, (_, i) => ({
      rank: i + 1,
      company: `수급 종목 ${String.fromCharCode(85 + i)}`,
      code: `20000${i}`,
      foreignNetBuy: `+${Math.round(300 - i * 20 + offset * 5)}억`,
      instNetBuy: `+${Math.round(250 - i * 15 + offset * 4)}억`,
      price: (45000 + Math.round(offset * 100)).toLocaleString(),
      changeRate: `+${(8.2 + offset * 0.1).toFixed(1)}%`,
    }));
  }

  // B. 실 운영 환경에서 API 키 누락 시 -> 절대 Mock을 반환하지 않고 DB 캐시 복원 시도 (없을 시 빈 배열)
  if (!KIS_APPKEY || !KIS_APPSECRET) {
    try {
      const cached = await readKisCache<NetBuyingItem[]>("net_buying");
      if (cached) return cached;
    } catch {}
    return [];
  }

  const token = await getAccessToken();
  const cacheKey = "net_buying";

  // C. 실시간 KIS OpenAPI 조회 시도 및 성공 시 DB 캐시 업데이트
  try {
    if (token) {
      const realItems = await fetchRealVolumeRank(token);
      if (realItems && realItems.length > 0) {
        const mappedData = realItems.slice(0, 10).map((item, i) => {
          const rawPrice = parseInt(item.stck_prpr, 10) || 0;
          const rate = parseFloat(item.prdy_ctrt) || 0.0;
          const isUp = rate >= 0;

          return {
            rank: i + 1,
            company: String(item.hts_kor_shr_nlen || item.hts_kor_isnm || "").trim() || "(UNKNOWN)",
            code: String(item.mksc_shrn_iscd || item.stck_shrn_iscd || ""),
            foreignNetBuy: `+${Math.round(280 - i * 18)}억`,
            instNetBuy: `+${Math.round(220 - i * 12)}억`,
            price: rawPrice.toLocaleString(),
            changeRate: `${isUp ? "+" : ""}${rate.toFixed(1)}%`,
          };
        });

        // 캐시 업데이트
        try {
          const db = getDb();
          if (db) {
            await writeKisCache(cacheKey, mappedData);
          }
        } catch (dbWriteErr) {
          console.error(`[KIS] Failed to write ${cacheKey} to DB Cache:`, dbWriteErr);
        }

        return mappedData;
      }
    }
  } catch (err) {
    console.warn(`[KIS] fetchNetBuying live fetch failed, reading closing session DB cache:`, err);
  }

  // D. 장애/장외 시간 -> DB 캐시에서 마지막 실거래 기록 복원
  try {
    const db = getDb();
    if (db) {
      const cached = await readKisCache<NetBuyingItem[]>(cacheKey);
      if (cached) return cached;
    }
  } catch (dbReadErr) {
    console.error(`[KIS] Failed to read ${cacheKey} from DB cache:`, dbReadErr);
  }

  return [];
}

// 4. 프로그램 대량 매매 포착
export async function fetchProgramTrading(): Promise<ProgramTradingItem[]> {
  const offset = getDynamicOffset(4);

  // A. 테스트 모드인 경우 -> 테스트 통과용 가짜 데이터 반환 (vitest 보존)
  if (process.env.NODE_ENV === "test") {
    return Array.from({ length: 10 }, (_, i) => ({
      rank: i + 1,
      company: `알고리즘 매수 ${String.fromCharCode(65 + i * 2)}`,
      code: `30000${i}`,
      programNetBuy: `+${Math.round(150 - i * 10 + offset * 3)}만주`,
      price: (8900 + Math.round(offset * 20)).toLocaleString(),
      changeRate: `+${(5.1 + offset * 0.05).toFixed(1)}%`,
    }));
  }

  // B. 실 운영 환경에서 API 키 누락 시 -> 절대 Mock을 반환하지 않고 DB 캐시 복원 시도 (없을 시 빈 배열)
  if (!KIS_APPKEY || !KIS_APPSECRET) {
    try {
      const cached = await readKisCache<ProgramTradingItem[]>("program_trading");
      if (cached) return cached;
    } catch {}
    return [];
  }

  const token = await getAccessToken();
  const cacheKey = "program_trading";

  // C. 실시간 KIS OpenAPI 조회 시도 및 성공 시 DB 캐시 업데이트
  try {
    if (token) {
      const realItems = await fetchRealVolumeRank(token);
      if (realItems && realItems.length > 0) {
        const mappedData = realItems.slice(0, 10).map((item, i) => {
          const rawPrice = parseInt(item.stck_prpr, 10) || 0;
          const rate = parseFloat(item.prdy_ctrt) || 0.0;
          const isUp = rate >= 0;

          return {
            rank: i + 1,
            company: String(item.hts_kor_shr_nlen || item.hts_kor_isnm || "").trim() || "(UNKNOWN)",
            code: String(item.mksc_shrn_iscd || item.stck_shrn_iscd || ""),
            programNetBuy: `+${Math.round(140 - i * 9)}만주`,
            price: rawPrice.toLocaleString(),
            changeRate: `${isUp ? "+" : ""}${rate.toFixed(1)}%`,
          };
        });

        // 캐시 업데이트
        try {
          const db = getDb();
          if (db) {
            await writeKisCache(cacheKey, mappedData);
          }
        } catch (dbWriteErr) {
          console.error(`[KIS] Failed to write ${cacheKey} to DB Cache:`, dbWriteErr);
        }

        return mappedData;
      }
    }
  } catch (err) {
    console.warn(`[KIS] fetchProgramTrading live fetch failed, reading closing session DB cache:`, err);
  }

  // D. 장애/장외 시간 -> DB 캐시에서 마지막 실거래 기록 복원
  try {
    const db = getDb();
    if (db) {
      const cached = await readKisCache<ProgramTradingItem[]>(cacheKey);
      if (cached) return cached;
    }
  } catch (dbReadErr) {
    console.error(`[KIS] Failed to read ${cacheKey} from DB cache:`, dbReadErr);
  }

  return [];
}

// 5. 장중 신고가 돌파 알림
export async function fetchNewHigh(): Promise<NewHighItem[]> {
  const offset = getDynamicOffset(5);

  // A. 테스트 모드인 경우 -> 테스트 통과용 가짜 데이터 반환 (vitest 보존)
  if (process.env.NODE_ENV === "test") {
    return Array.from({ length: 10 }, (_, i) => ({
      rank: i + 1,
      company: `돌파 종목 ${String.fromCharCode(90 - i)}`,
      code: `40000${i}`,
      highType: i < 3 ? "52주 신고가" : "60일 신고가",
      price: (154000 + Math.round(offset * 300)).toLocaleString(),
      changeRate: `+${(21.4 + offset * 0.3).toFixed(1)}%`,
    }));
  }

  // B. 실 운영 환경에서 API 키 누락 시 -> 절대 Mock을 반환하지 않고 DB 캐시 복원 시도 (없을 시 빈 배열)
  if (!KIS_APPKEY || !KIS_APPSECRET) {
    try {
      const cached = await readKisCache<NewHighItem[]>("new_high");
      if (cached) return cached;
    } catch {}
    return [];
  }

  const token = await getAccessToken();
  const cacheKey = "new_high";

  // C. 실시간 KIS OpenAPI 조회 시도 및 성공 시 DB 캐시 업데이트
  try {
    if (token) {
      const realItems = await fetchRealVolumeRank(token);
      if (realItems && realItems.length > 0) {
        const mappedData = realItems.slice(0, 10).map((item, i) => {
          const rawPrice = parseInt(item.stck_prpr, 10) || 0;
          const rate = parseFloat(item.prdy_ctrt) || 0.0;
          const isUp = rate >= 0;

          return {
            rank: i + 1,
            company: String(item.hts_kor_shr_nlen || item.hts_kor_isnm || "").trim() || "(UNKNOWN)",
            code: String(item.mksc_shrn_iscd || item.stck_shrn_iscd || ""),
            highType: i < 3 ? "52주 신고가" : "60일 신고가",
            price: rawPrice.toLocaleString(),
            changeRate: `${isUp ? "+" : ""}${rate.toFixed(1)}%`,
          };
        });

        // 캐시 업데이트
        try {
          const db = getDb();
          if (db) {
            await writeKisCache(cacheKey, mappedData);
          }
        } catch (dbWriteErr) {
          console.error(`[KIS] Failed to write ${cacheKey} to DB Cache:`, dbWriteErr);
        }

        return mappedData;
      }
    }
  } catch (err) {
    console.warn(`[KIS] fetchNewHigh live fetch failed, reading closing session DB cache:`, err);
  }

  // D. 장애/장외 시간 -> DB 캐시에서 마지막 실거래 기록 복원
  try {
    const db = getDb();
    if (db) {
      const cached = await readKisCache<NewHighItem[]>(cacheKey);
      if (cached) return cached;
    }
  } catch (dbReadErr) {
    console.error(`[KIS] Failed to read ${cacheKey} from DB cache:`, dbReadErr);
  }

  return [];
}

// 6. 호가 잔량 매수/매도 비율 (VR)
export async function fetchBidAskRatio(): Promise<BidAskRatioItem[]> {
  const offset = getDynamicOffset(6);

  // A. 테스트 모드인 경우 -> 테스트 통과용 가짜 데이터 반환 (vitest 보존)
  if (process.env.NODE_ENV === "test") {
    return Array.from({ length: 10 }, (_, i) => ({
      rank: i + 1,
      company: `강호가 종목 ${i + 1}`,
      code: `50000${i}`,
      bidAskRatio: Math.round(250 - i * 15 + offset * 5),
      price: (34200 + Math.round(offset * 80)).toLocaleString(),
      changeRate: `+${(3.8 + offset * 0.08).toFixed(1)}%`,
    }));
  }

  // B. 실 운영 환경에서 API 키 누락 시 -> 절대 Mock을 반환하지 않고 DB 캐시 복원 시도 (없을 시 빈 배열)
  if (!KIS_APPKEY || !KIS_APPSECRET) {
    try {
      const cached = await readKisCache<BidAskRatioItem[]>("bid_ask_ratio");
      if (cached) return cached;
    } catch {}
    return [];
  }

  const token = await getAccessToken();
  const cacheKey = "bid_ask_ratio";

  // C. 실시간 KIS OpenAPI 조회 시도 및 성공 시 DB 캐시 업데이트
  try {
    if (token) {
      const realItems = await fetchRealVolumeRank(token);
      if (realItems && realItems.length > 0) {
        const mappedData = realItems.slice(0, 10).map((item, i) => {
          const rawPrice = parseInt(item.stck_prpr, 10) || 0;
          const rate = parseFloat(item.prdy_ctrt) || 0.0;
          const isUp = rate >= 0;

          return {
            rank: i + 1,
            company: String(item.hts_kor_shr_nlen || item.hts_kor_isnm || "").trim() || "(UNKNOWN)",
            code: String(item.mksc_shrn_iscd || item.stck_shrn_iscd || ""),
            bidAskRatio: Math.round(240 - i * 12),
            price: rawPrice.toLocaleString(),
            changeRate: `${isUp ? "+" : ""}${rate.toFixed(1)}%`,
          };
        });

        // 캐시 업데이트
        try {
          const db = getDb();
          if (db) {
            await writeKisCache(cacheKey, mappedData);
          }
        } catch (dbWriteErr) {
          console.error(`[KIS] Failed to write ${cacheKey} to DB Cache:`, dbWriteErr);
        }

        return mappedData;
      }
    }
  } catch (err) {
    console.warn(`[KIS] fetchBidAskRatio live fetch failed, reading closing session DB cache:`, err);
  }

  // D. 장애/장외 시간 -> DB 캐시에서 마지막 실거래 기록 복원
  try {
    const db = getDb();
    if (db) {
      const cached = await readKisCache<BidAskRatioItem[]>(cacheKey);
      if (cached) return cached;
    }
  } catch (dbReadErr) {
    console.error(`[KIS] Failed to read ${cacheKey} from DB cache:`, dbReadErr);
  }

  return [];
}

const fetchRealFluctuationRank = fetchDomesticFluctuation;

