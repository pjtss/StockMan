import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { topRisingStocks, kisCache } from "@/lib/schema";
import { syncTopRisingStocks } from "@/lib/kis-us";
import { eq } from "drizzle-orm";
import { isUsTopRisingOpen } from "@/lib/scanner-hours";
import { loadAdminFeatureFlags } from "@/lib/admin-flags";

export const dynamic = "force-dynamic";

export async function GET() {
  const headers = new Headers();
  headers.set("Cache-Control", "no-store, max-age=0");

  try {
    const flags = await loadAdminFeatureFlags();
    if (!flags.us_scanners) {
      headers.set("x-debug-status", "disabled");
      headers.set("x-debug-reason", "미국 스캐너 기능이 관리자에 의해 비활성화되었습니다.");
      return NextResponse.json({ error: "US scanner disabled by admin" }, { status: 503, headers });
    }
    if (!(await isUsTopRisingOpen())) {
      headers.set("x-debug-status", "disabled");
      headers.set("x-debug-reason", "미국 상승률 TOP N은 설정된 시간에만 동작합니다.");
      return NextResponse.json({ error: "US top-rising disabled outside schedule" }, { status: 503, headers });
    }

    const db = getDb();
    if (!db) {
      headers.set("x-debug-status", "error");
      headers.set("x-debug-reason", "Database connection is not available. Please verify DATABASE_URL.");
      return NextResponse.json({ error: "Database not connected" }, { status: 500, headers });
    }

    let records = await db.select().from(topRisingStocks);
    let debugReason = "Records found in database.";

    // 가짜(Mock/시뮬레이션) 데이터가 절대 흘러나가지 못하게 필터링 적용하는 헬퍼 함수
    const filterFunc = (r: any) => {
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
    };

    let filteredRecords = records.filter(filterFunc);

    // 1. DB가 비어있거나, DB에 레코드가 있지만 유효한(실거래) 레코드가 0개인 경우 (모두 Mock 데이터로 채워진 자가 치유 대상)
    if (records.length === 0 || filteredRecords.length === 0) {
      debugReason = records.length === 0 
        ? "DB topRisingStocks table was empty. Triggered auto syncTopRisingStocks."
        : `DB contained ${records.length} records, but all were filtered out as MOCK. Triggered auto syncTopRisingStocks.`;
      
      try {
        await syncTopRisingStocks();
        records = await db.select().from(topRisingStocks);
        filteredRecords = records.filter(filterFunc);
        if (filteredRecords.length === 0) {
          // KIS OpenAPI 동기화 결과가 0개인 경우 (장외 시간 등), 최후의 보루로 DB의 kisCache 백업 캐시 복원 시도 (무가짜 리얼 데이터 원칙 준수)
          const cacheRecord = await db.select({ data: kisCache.data })
            .from(kisCache)
            .where(eq(kisCache.key, "top_rising_stocks"))
            .limit(1);

          if (cacheRecord.length > 0 && cacheRecord[0].data) {
            const cacheData = cacheRecord[0].data as any[];
            filteredRecords = cacheData.filter(filterFunc).map((item, idx) => ({
              id: idx + 1,
              code: item.code,
              company: item.company,
              changeRate: item.changeRate,
              price: item.price,
              addedAt: new Date()
            }));
            debugReason = `Triggered auto-sync but KIS API returned 0 items (possibly outside market hours). Successfully restored ${filteredRecords.length} items from fallback DB cache (kisCache).`;
          } else {
            debugReason = "Triggered auto-sync, but KIS OpenAPI still returned 0 valid items and DB fallback cache (kisCache) was empty.";
          }
        } else {
          debugReason = "Successfully triggered auto-sync and retrieved valid KIS records.";
        }
      } catch (syncErr: any) {
        const errorMsg = syncErr.message || String(syncErr);
        debugReason = `Triggered auto-sync, but KIS OpenAPI returned an error: ${errorMsg}`;
        console.warn("[KIS] Auto sync failed, trying DB cache restore:", syncErr);
        
        // 싱크 작업 자체가 크래시 났을 때도 캐시 복원 시도
        try {
          const cacheRecord = await db.select({ data: kisCache.data })
            .from(kisCache)
            .where(eq(kisCache.key, "top_rising_stocks"))
            .limit(1);

          if (cacheRecord.length > 0 && cacheRecord[0].data) {
            const cacheData = cacheRecord[0].data as any[];
            filteredRecords = cacheData.filter(filterFunc).map((item, idx) => ({
              id: idx + 1,
              code: item.code,
              company: item.company,
              changeRate: item.changeRate,
              price: item.price,
              addedAt: new Date()
            }));
            debugReason = `Auto-sync crashed (${errorMsg}), but successfully restored ${filteredRecords.length} items from fallback DB cache (kisCache).`;
          } else {
            debugReason = `Triggered auto-sync failed: ${errorMsg}. DB fallback cache (kisCache) was also empty.`;
          }
        } catch (dbErr: any) {
          console.error("[KIS] DB cache fallback on crash failed:", dbErr);
          debugReason = `Triggered auto-sync failed: ${errorMsg}. DB fallback cache query also crashed.`;
        }
      }
    }

    // 등락률 숫자 기준으로 내림차순 정렬
    const sortedRecords = filteredRecords.sort((a, b) => {
      const rateA = parseFloat(a.changeRate.replace(/[+%]/g, "")) || 0;
      const rateB = parseFloat(b.changeRate.replace(/[+%]/g, "")) || 0;
      return rateB - rateA;
    });

    if (sortedRecords.length === 0) {
      headers.set("x-debug-status", "empty");
      headers.set("x-debug-reason", debugReason);
    } else if (debugReason.includes("restored") || debugReason.includes("fallback") || debugReason.includes("crashed")) {
      headers.set("x-debug-status", "fallback");
      headers.set("x-debug-reason", debugReason);
    } else {
      headers.set("x-debug-status", "success");
      headers.set("x-debug-reason", "Data successfully loaded and filtered.");
    }

    return NextResponse.json(sortedRecords, { headers });
  } catch (error: any) {
    console.error("Failed to fetch top rising stocks:", error);
    headers.set("x-debug-status", "error");
    headers.set("x-debug-reason", `Server error: ${error.message || error}`);
    return NextResponse.json({ error: String(error) }, { status: 500, headers });
  }
}
