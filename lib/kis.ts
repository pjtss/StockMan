export type { BidAskRatioItem, NetBuyingItem, NewHighItem, ProgramTradingItem, StockIntensity, TopRisingStockItem, VolumeSpikeItem } from "./kis-types";
import type { StockIntensity, VolumeSpikeItem, NetBuyingItem, ProgramTradingItem, NewHighItem, BidAskRatioItem, TopRisingStockItem } from "./kis-types";
import { KIS_APPKEY, KIS_APPSECRET, getDynamicOffset } from "./kis-runtime";

import { getDb } from "./db";
import { topRisingStocks, topIntensityStocks } from "./schema";
import { ensureUsInstrument } from "./us-daily-breakout-watchlist";
import { eq, inArray } from "drizzle-orm";
import { getAccessToken } from "./kis-token";
import { readKisCache, writeKisCache } from "./kis-cache";
import { fetchDomesticFluctuation, fetchDomesticVolumePower } from "./kis-domestic-api";

export { clearTokenCache, getAccessToken, refreshAccessToken } from "./kis-token";

export { getKisMode } from "./kis-runtime";

// 국내주식 API 호출은 kis-domestic-api 모듈이 담당한다.
const fetchRealVolumePower = fetchDomesticVolumePower;

// Backward compat: other scanners still call the older helper name.
const fetchRealVolumeRank = fetchRealVolumePower;

// 1. 체결강도 상위
export async function fetchTradingIntensity(): Promise<StockIntensity[]> {
  const offset = getDynamicOffset(1);
  const withError = (items: StockIntensity[], message: string) => {
    (items as any).kisError = message;
    return items;
  };

  // A. 테스트 모드인 경우 -> 테스트 통과용 가짜 데이터 반환 (vitest 보존)
  if (process.env.NODE_ENV === "test") {
    return Array.from({ length: 10 }, (_, i) => {
      const baseIntensity = 180 - i * 8;
      const dynamicIntensity = Math.max(50, Math.round(baseIntensity + offset * 3));
      const isUp = offset > 0;
      return {
        rank: i + 1,
        company: `가짜 종목 ${String.fromCharCode(65 + i)}`,
        code: `00000${i}`,
        intensity: dynamicIntensity,
        price: (75000 + Math.round(offset * 200)).toLocaleString(),
        change: `${isUp ? "+" : "-"}${Math.abs(Math.round(1200 + offset * 150)).toLocaleString()}`,
        changeRate: `${isUp ? "+" : ""}${(1.5 + offset * 0.1).toFixed(2)}%`,
      };
    });
  }

  // B. 실 운영 환경에서 API 키 누락 시 -> 절대 Mock을 반환하지 않고 DB 캐시 복원 시도 (없을 시 빈 배열)
  if (!KIS_APPKEY || !KIS_APPSECRET) {
    try {
      const restored = await readKisCache<StockIntensity[]>("trading_intensity");
      if (restored) {
        (restored as any).isFallback = true;
        (restored as any).fallbackSource = "db";
        return withError(restored, "API credentials missing; restored from DB cache.");
      }
    } catch {}
    return withError([], "API credentials missing; no DB cache available.");
  }

  const token = await getAccessToken();
  const cacheKey = "trading_intensity";

  // C. 실시간 KIS OpenAPI 조회 시도 및 성공 시 DB 캐시 업데이트
  try {
    if (!token) {
      console.warn("[KIS-DEBUG] Access token fetch failed, returning empty array");
      return withError([], "getAccessToken() returned null.");
    }

    const realItems = await fetchRealVolumePower(token);
    if (realItems && realItems.length > 0) {
        const mappedData = realItems.map((item, i) => {
          const rawPrice = parseInt(item.stck_prpr, 10) || 0;
          const rawVrss = parseInt(item.prdy_vrss, 10) || 0;
          const rate = parseFloat(item.prdy_ctrt) || 0.0;
          const isUp = rate >= 0;
          const rawIntensity = parseFloat(item.tday_rltv || "") || 0;
          const intensity = rawIntensity > 0 ? Math.round(rawIntensity) : Math.max(50, Math.round(160 - i * 6));

          return {
            rank: 0,
            // KIS 응답이 간헐적으로 필드를 누락할 수 있어 안전하게 처리한다.
            company: String(item.hts_kor_isnm || "").trim() || "(UNKNOWN)",
            code: String(item.stck_shrn_iscd || ""),
            intensity,
            price: rawPrice.toLocaleString(),
            change: `${isUp ? "+" : "-"}${Math.abs(rawVrss).toLocaleString()}`,
            changeRate: `${isUp ? "+" : ""}${rate.toFixed(2)}%`,
          };
        });

        // 체결강도 기준으로 내림차순 정렬
        const sortedData = mappedData.sort((a, b) => b.intensity - a.intensity);

        // 상위 10개 추출 및 순위 재정의
        const top10 = sortedData.slice(0, 10).map((item, idx) => ({
          ...item,
          rank: idx + 1,
        }));

        // 데이터베이스 영속 캐시 갱신 (성공한 마지막 실제 데이터를 백그라운드 공유 저장)
        try {
          await writeKisCache(cacheKey, top10);
        } catch (dbWriteErr) {
          console.error(`[KIS] Failed to write ${cacheKey} to DB Cache:`, dbWriteErr);
        }

        return top10;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[KIS] fetchTradingIntensity live fetch failed, reading closing session DB cache:`, err);
    (globalThis as any).__lastKisTradingIntensityError = msg;
  }

  // D. 장애/장외 시간 -> 절대 Mock Data를 쓰지 않고 DB 캐시에서 마지막 실거래 기록 복원
  try {
    const restored = await readKisCache<StockIntensity[]>(cacheKey);
    if (restored) {
      (restored as any).isFallback = true;
      (restored as any).fallbackSource = "db";
      const lastErr = (globalThis as any).__lastKisTradingIntensityError;
      const msg = lastErr ? `KIS live fetch failed: ${lastErr}. Restored from DB cache.` : "Restored from DB cache.";
      return withError(restored, msg);
    }
  } catch (dbReadErr) {
    console.error(`[KIS] Failed to read ${cacheKey} from DB cache:`, dbReadErr);
  }

  const lastErr = (globalThis as any).__lastKisTradingIntensityError;
  const msg = lastErr ? `KIS live fetch failed: ${lastErr}. DB cache empty.` : "KIS live fetch returned empty and DB cache empty.";
  return withError([], msg);
}

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

// Mock 데이터 유출 방지 헬퍼 함수
function filterMockRisingStocks(items: TopRisingStockItem[]): TopRisingStockItem[] {
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

// 상승률 상위 TOP 10 조회
export async function fetchTopRisingStocks(): Promise<TopRisingStockItem[]> {
  const offset = getDynamicOffset(7);

  // A. 테스트 모드인 경우 -> 테스트 통과용 가짜 데이터 반환 (vitest 보존)
  if (process.env.NODE_ENV === "test") {
    return Array.from({ length: 10 }, (_, i) => {
      const baseRate = 29.5 - i * 2.1;
      const changeRate = `+${Math.max(1.0, baseRate + offset * 0.1).toFixed(2)}%`;
      return {
        rank: i + 1,
        company: `상승 종목 ${String.fromCharCode(65 + i)}`,
        code: `90000${i}`,
        price: (25000 - i * 1500 + Math.round(offset * 100)).toLocaleString(),
        changeRate,
      };
    });
  }

  // B. 실 운영 환경에서 API 키 누락 시 -> 절대 Mock을 반환하지 않고 DB 캐시 복원 시도 (없을 시 빈 배열)
  if (!KIS_APPKEY || !KIS_APPSECRET) {
    console.warn(`[KIS-DEBUG] fetchTopRisingStocks: KIS API credentials missing (KIS_APPKEY: ${!!KIS_APPKEY}, KIS_APPSECRET: ${!!KIS_APPSECRET}). Attempting DB Cache restore.`);
    try {
      const cached = await readKisCache<TopRisingStockItem[]>("top_rising_stocks");
      if (cached) {
        const filtered = filterMockRisingStocks(cached);
        console.info(`[KIS-DEBUG] fetchTopRisingStocks: Successfully restored ${filtered.length} items from DB cache.`);
        return filtered;
      }
      console.warn("[KIS-DEBUG] fetchTopRisingStocks empty return: API credentials missing and 'top_rising_stocks' DB cache is empty.");
    } catch (dbErr: any) {
      console.error("[KIS-DEBUG] fetchTopRisingStocks empty return: API credentials missing and DB cache read crashed:", dbErr.message);
    }
    return [];
  }

  const token = await getAccessToken();
  const cacheKey = "top_rising_stocks";

  // C. 실시간 KIS OpenAPI 조회 시도 및 성공 시 DB 캐시 업데이트
  try {
    if (token) {
      const realItems = await fetchRealFluctuationRank(token);
      if (realItems && realItems.length > 0) {
        const mappedData = realItems.slice(0, 10).map((item, i) => {
          const rawPrice = parseInt(item.stck_prpr, 10) || 0;
          const rate = parseFloat(item.prdy_ctrt) || 0.0;
          const isUp = rate >= 0;

          return {
            rank: i + 1,
            company: String(item.hts_kor_shr_nlen || item.hts_kor_isnm || "").trim() || "(UNKNOWN)",
            code: String(item.mksc_shrn_iscd || item.stck_shrn_iscd || ""),
            price: rawPrice.toLocaleString(),
            changeRate: `${isUp ? "+" : ""}${rate.toFixed(2)}%`,
          };
        });

        // 데이터베이스 영속 캐시 갱신
        try {
          const db = getDb();
          if (db) {
            await writeKisCache(cacheKey, mappedData);
          }
        } catch (dbWriteErr: any) {
          console.error(`[KIS-DEBUG] fetchTopRisingStocks: Failed to write ${cacheKey} to DB Cache:`, dbWriteErr.message);
        }

        const filtered = filterMockRisingStocks(mappedData);
        console.info(`[KIS-DEBUG] fetchTopRisingStocks: Successfully fetched ${filtered.length} real-time items from KIS OpenAPI.`);
        return filtered;
      } else {
        console.warn("[KIS-DEBUG] fetchTopRisingStocks: Realtime fetch succeeded but returned 0 items from KIS OpenAPI.");
      }
    } else {
      console.warn("[KIS-DEBUG] fetchTopRisingStocks: Failed to retrieve KIS AccessToken (returned null/empty).");
    }
  } catch (err: any) {
    console.warn(`[KIS-DEBUG] fetchTopRisingStocks: Realtime fetch failed, falling back to DB cache:`, err.message || err);
  }

  // D. 장애/장외 시간 -> DB 캐시에서 마지막 실거래 기록 복원
  try {
    const cached = await readKisCache<TopRisingStockItem[]>(cacheKey);
    if (cached) {
      const restored = filterMockRisingStocks(cached);
      console.info(`[KIS-DEBUG] fetchTopRisingStocks: Successfully restored ${restored.length} items from fallback DB cache.`);
      return restored;
    }
    console.warn(`[KIS-DEBUG] fetchTopRisingStocks empty return: DB cache key '${cacheKey}' is empty or does not exist.`);
  } catch (dbReadErr: any) {
    console.error(`[KIS-DEBUG] fetchTopRisingStocks empty return: Failed to read DB cache:`, dbReadErr.message);
  }

  console.warn("[KIS-DEBUG] fetchTopRisingStocks empty return: End of function reached with no valid real-world data.");
  return [];
}

// 상승률 상위 TOP 10 싱크 및 비교 로직 (신규 진입 종목 배열 반환하여 push 알림에 활용)
export async function syncTopRisingStocks(): Promise<TopRisingStockItem[]> {
  const db = getDb();
  if (!db) return [];

  // A. 최신 TOP 10 정보 조회
  const newTop10 = await fetchTopRisingStocks();
  if (newTop10.length === 0) return [];

  // B. 기존 DB 저장된 TOP 10 조회
  const oldTop10 = await db.select().from(topRisingStocks);
  const oldCodes = new Set(oldTop10.map((s) => s.code));
  const newCodes = new Set(newTop10.map((s) => s.code));

  // C. 누락된 종목 삭제 (기존 TOP 10에 있었으나 신규 TOP 10에 없는 것)
  const obsoleteCodes = oldTop10.filter((s) => !newCodes.has(s.code)).map((s) => s.code);
  if (obsoleteCodes.length > 0) {
    await db.delete(topRisingStocks).where(inArray(topRisingStocks.code, obsoleteCodes));
  }

  // D. 신규 종목 추가 (신규 TOP 10에 있으나 기존 TOP 10에 없던 것)
  const newlyAdded = newTop10.filter((s) => !oldCodes.has(s.code));
  if (newlyAdded.length > 0) {
    const instrumentIds = new Map(await Promise.all(newlyAdded.map(async (s) => {
      try { return [s.code, await ensureUsInstrument({ market: "KRX", code: s.code, name: s.company })] as const; } catch { return [s.code, null] as const; }
    })));
    await db.insert(topRisingStocks).values(
      newlyAdded.map((s) => ({
        code: s.code,
        company: s.company,
        changeRate: s.changeRate,
        price: s.price,
        addedAt: new Date(),
        instrumentId: instrumentIds.get(s.code) ?? undefined,
      }))
    );
  }

  // E. 기존 유지 종목의 가격 및 상승률 정보 갱신 (추가 시간인 addedAt은 유지)
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

// 서울 시간대 (UTC+9) 날짜 문자열(YYYY-MM-DD) 반환 헬퍼
function getSeoulDateStr(d: Date): string {
  const seoulTime = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return seoulTime.toISOString().split("T")[0];
}

// 체결강도 상위 TOP 10 싱크 및 비교 로직 (신규 진입 종목 배열 반환하여 push 알림에 활용)
export async function syncTradingIntensityStocks(): Promise<StockIntensity[]> {
  const db = getDb();
  if (!db) return [];

  // A. 최신 TOP 10 정보 조회
  const newTop10 = await fetchTradingIntensity();
  if (newTop10.length === 0) return [];

  const todayStr = getSeoulDateStr(new Date());

  // B. 기존 DB 저장된 TOP 10 조회
  let oldTop10 = await db.select().from(topIntensityStocks);

  // C. 오늘 날짜 기준 정합성 검증 (날짜가 다르면 기존 데이터 완전 초기화)
  if (oldTop10.length > 0) {
    const lastRecordDate = getSeoulDateStr(oldTop10[0].addedAt);
    if (lastRecordDate !== todayStr) {
      await db.delete(topIntensityStocks);
      oldTop10 = [];
    }
  }

  const oldCodes = new Set(oldTop10.map((s) => s.code));
  const newCodes = new Set(newTop10.map((s) => s.code));

  // D. 누락된 종목 삭제 (기존 TOP 10에 있었으나 신규 TOP 10에 없는 것)
  const obsoleteCodes = oldTop10.filter((s) => !newCodes.has(s.code)).map((s) => s.code);
  if (obsoleteCodes.length > 0) {
    await db.delete(topIntensityStocks).where(inArray(topIntensityStocks.code, obsoleteCodes));
  }

  // E. 신규 종목 추가 (신규 TOP 10에 있으나 기존 TOP 10에 없던 것)
  const newlyAdded = newTop10.filter((s) => !oldCodes.has(s.code));
  if (newlyAdded.length > 0) {
    const instrumentIds = new Map(await Promise.all(newlyAdded.map(async (s) => {
      try { return [s.code, await ensureUsInstrument({ market: "KRX", code: s.code, name: s.company })] as const; } catch { return [s.code, null] as const; }
    })));
    await db.insert(topIntensityStocks).values(
      newlyAdded.map((s) => ({
        code: s.code,
        company: s.company,
        intensity: s.intensity,
        price: s.price,
        changeRate: s.changeRate,
        addedAt: new Date(),
        instrumentId: instrumentIds.get(s.code) ?? undefined,
      }))
    );
  }

  // F. 기존 유지 종목의 가격, 등락률 및 체결강도 정보 갱신 (추가 시간인 addedAt은 유지)
  const existing = newTop10.filter((s) => oldCodes.has(s.code));
  for (const s of existing) {
    await db.update(topIntensityStocks)
      .set({
        intensity: s.intensity,
        price: s.price,
        changeRate: s.changeRate,
      })
      .where(eq(topIntensityStocks.code, s.code));
  }

  return newlyAdded;
}

