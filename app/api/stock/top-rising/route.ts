import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { topRisingStocks } from "@/lib/schema";
import { syncTopRisingStocks } from "@/lib/kis-us";
import { isUsTopRisingOpen } from "@/lib/scanner-hours";
import { loadAdminFeatureFlags } from "@/lib/admin-flags";

export const dynamic = "force-dynamic";

function asciiOnly(value: string, fallback = "") {
  return /^[\x00-\x7F]*$/.test(value) ? value : fallback;
}

export async function GET() {
  const headers = new Headers();
  headers.set("Cache-Control", "no-store, max-age=0");

  try {
    const flags = await loadAdminFeatureFlags();
    if (!flags.us_scanners) {
      headers.set("x-debug-status", "disabled");
      headers.set("x-debug-reason", "US scanner disabled by admin.");
      return NextResponse.json({ error: "US scanner disabled by admin" }, { status: 503, headers });
    }
    if (!(await isUsTopRisingOpen())) {
      headers.set("x-debug-status", "disabled");
      headers.set("x-debug-reason", "US top rising runs only during the configured schedule.");
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

    if (records.length === 0 || filteredRecords.length === 0) {
      debugReason = records.length === 0 
        ? "DB topRisingStocks table was empty. Triggered auto syncTopRisingStocks."
        : `DB contained ${records.length} records, but all were filtered out as MOCK. Triggered auto syncTopRisingStocks.`;
      
      try {
        await syncTopRisingStocks();
        records = await db.select().from(topRisingStocks);
        filteredRecords = records.filter(filterFunc);
        if (filteredRecords.length > 0) {
          debugReason = "Successfully triggered auto-sync and retrieved valid KIS records.";
        } else {
          debugReason = "Triggered auto-sync, but KIS OpenAPI returned 0 valid items. Returning empty array.";
        }
      } catch (syncErr: any) {
        const errorMsg = syncErr.message || String(syncErr);
        debugReason = `Triggered auto-sync, but KIS OpenAPI returned an error: ${errorMsg}`;
        console.warn("[KIS] Auto sync failed, returning empty array:", syncErr);
        filteredRecords = [];
        records = [];
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
      headers.set("x-debug-reason", asciiOnly(debugReason, "US top rising completed with no data."));
    } else if (debugReason.includes("restored") || debugReason.includes("fallback") || debugReason.includes("crashed")) {
      headers.set("x-debug-status", "fallback");
      headers.set("x-debug-reason", asciiOnly(debugReason, "US top rising fallback."));
    } else {
      headers.set("x-debug-status", "success");
      headers.set("x-debug-reason", "Data successfully loaded and filtered.");
    }

    return NextResponse.json(sortedRecords, { headers });
  } catch (error: any) {
    console.error("Failed to fetch top rising stocks:", error);
    headers.set("x-debug-status", "error");
    headers.set(
      "x-debug-reason",
      asciiOnly(`Server error: ${error.message || error}`, "Server error.")
    );
    return NextResponse.json({ error: String(error) }, { status: 500, headers });
  }
}
