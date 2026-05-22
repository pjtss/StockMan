import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { topRisingStocks } from "@/lib/schema";
import { syncTopRisingStocks } from "@/lib/kis";

export const dynamic = "force-dynamic";

export async function GET() {
  const headers = new Headers();
  headers.set("Cache-Control", "no-store, max-age=0");

  try {
    const db = getDb();
    if (!db) {
      headers.set("x-debug-status", "error");
      headers.set("x-debug-reason", "Database connection is not available. Please verify DATABASE_URL.");
      return NextResponse.json({ error: "Database not connected" }, { status: 500, headers });
    }

    let records = await db.select().from(topRisingStocks);
    let debugReason = "Records found in database.";

    // 1. DB가 비어있는 경우, 자동으로 최신 KIS TOP 10 동기화 트리거
    if (records.length === 0) {
      debugReason = "DB topRisingStocks table was empty. Triggered auto syncTopRisingStocks.";
      try {
        await syncTopRisingStocks();
        records = await db.select().from(topRisingStocks);
        if (records.length === 0) {
          debugReason = "DB was empty, triggered auto-sync, but KIS OpenAPI still returned 0 items (possibly outside market hours or invalid credentials).";
        } else {
          debugReason = "DB was empty, triggered auto-sync, and successfully retrieved records.";
        }
      } catch (syncErr: any) {
        debugReason = `DB was empty, triggered auto-sync, but it crashed: ${syncErr.message || syncErr}`;
        console.warn("[KIS] Auto sync on empty DB failed:", syncErr);
      }
    }

    // 가짜(Mock/시뮬레이션) 데이터가 절대 흘러나가지 못하게 필터링 적용 (실데이터 무결성 확보)
    const originalCount = records.length;
    const filteredRecords = records.filter((r) => {
      const company = r.company.toLowerCase();
      const code = r.code;
      
      // 시뮬레이션, mock, 상승 종목, 테스트가 들어있거나 코드 형식이 테스트용(00000x 등)인 경우 필터링
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

    if (originalCount > 0 && filteredRecords.length === 0) {
      debugReason = `Retrieved ${originalCount} records from DB, but ALL of them were filtered out as MOCK/TEST data. Code starting with 00000/90000 or company name containing test/mock.`;
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

