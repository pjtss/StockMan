import { NextResponse } from "next/server";
import { syncUsTradingIntensityStocks } from "@/lib/kis-us";
import { getDb } from "@/lib/db";
import { kisCache } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { isUsScannerOpen } from "@/lib/scanner-hours";
import { loadAdminFeatureFlags } from "@/lib/admin-flags";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const flags = await loadAdminFeatureFlags();
    if (!flags.us_scanners) {
      return NextResponse.json(
        { success: false, error: "미국 스캐너 기능이 관리자에 의해 비활성화되었습니다." },
        { status: 503 },
      );
    }
    if (!(await isUsScannerOpen())) {
      return NextResponse.json(
        { success: false, error: "미국 스캐너는 KST 17:00~02:00에만 동작합니다." },
        { status: 503 },
      );
    }

    const newRecords = await syncUsTradingIntensityStocks();
    
    // KIS OpenAPI 연동이 모종의 이유(장외 등)로 실패하거나 빈 배열 반환 시 DB 영속 캐시에서 안전하게 100% 실데이터를 복원
    if (newRecords.length === 0) {
      console.warn("[KIS-US-SYNC-API] syncUsTradingIntensityStocks returned empty. Attempting to fallback to kisCache DB...");
      const db = getDb();
      if (db) {
        const cacheRecord = await db.select({ data: kisCache.data })
          .from(kisCache)
          .where(eq(kisCache.key, "us_trading_intensity"))
          .limit(1);

        if (cacheRecord.length > 0 && cacheRecord[0].data) {
          const cacheData = cacheRecord[0].data as any[];
          console.info(`[KIS-US-SYNC-API] Successfully restored ${cacheData.length} US intensity items from kisCache fallback.`);
          return NextResponse.json({ 
            success: true, 
            data: cacheData,
            debug: { fallback: true, message: "Restored from DB cache due to KIS API return empty" }
          });
        }
      }
    }

    return NextResponse.json({ 
      success: true, 
      data: newRecords,
      debug: { fallback: false, message: "Live KIS API Sync Successful" }
    });
  } catch (error) {
    console.error("[API] us intensity sync error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to sync US intensity stocks" },
      { status: 500 }
    );
  }
}
