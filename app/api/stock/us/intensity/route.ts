import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { usIntensityStocks, kisCache } from "@/lib/schema";
import { syncUsTradingIntensityStocks } from "@/lib/kis-us";
import { eq } from "drizzle-orm";
import { isUsScannerOpen } from "@/lib/scanner-hours";
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
    if (!(await isUsScannerOpen())) {
      headers.set("x-debug-status", "disabled");
      headers.set("x-debug-reason", "US scanner only runs from KST 17:00 to 02:00.");
      return NextResponse.json({ error: "US scanner disabled outside market hours" }, { status: 503, headers });
    }

    const db = getDb();
    if (!db) {
      headers.set("x-debug-status", "error");
      headers.set("x-debug-reason", "Database connection is not available. Please verify DATABASE_URL.");
      return NextResponse.json({ error: "Database not connected" }, { status: 500, headers });
    }

    let records = await db.select().from(usIntensityStocks);
    let debugReason = "Records found in database.";

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
        ? "DB usIntensityStocks table was empty. Triggered auto syncUsTradingIntensityStocks."
        : `DB contained ${records.length} records, but all were filtered out as MOCK. Triggered auto syncUsTradingIntensityStocks.`;
      
      try {
        await syncUsTradingIntensityStocks();
        records = await db.select().from(usIntensityStocks);
        filteredRecords = records.filter(filterFunc);
        if (filteredRecords.length === 0) {
          const cacheRecord = await db.select({ data: kisCache.data })
            .from(kisCache)
            .where(eq(kisCache.key, "us_trading_intensity"))
            .limit(1);

          if (cacheRecord.length > 0 && cacheRecord[0].data) {
            const cacheData = cacheRecord[0].data as any[];
            filteredRecords = cacheData.filter(filterFunc).map((item, idx) => ({
              ...item,
              addedAt: new Date(),
            }));
            debugReason = "Restored from kisCache (us_trading_intensity) due to API failure/empty data.";
            headers.set("x-debug-status", "fallback");
          } else {
            debugReason = "KIS OpenAPI sync failed and no valid kisCache fallback found.";
            headers.set("x-debug-status", "empty");
            return NextResponse.json([], { status: 200, headers });
          }
        } else {
          headers.set("x-debug-status", "synced");
        }
      } catch (err: any) {
        debugReason = `Sync failed: ${err.message}`;
        headers.set("x-debug-status", "error");
      }
    } else {
      headers.set("x-debug-status", "hit");
    }

    headers.set("x-debug-reason", asciiOnly(debugReason, "US intensity fetch completed."));
    
    // Sort by intensity descending
    filteredRecords.sort((a, b) => b.intensity - a.intensity);
    
    return NextResponse.json(filteredRecords, { headers });
  } catch (error) {
    console.error("[API] us intensity fetch error:", error);
    headers.set("x-debug-status", "error");
    headers.set(
      "x-debug-reason",
      asciiOnly(`Server crash: ${error instanceof Error ? error.message : "Unknown error"}`, "Server crash.")
    );
    return NextResponse.json(
      { error: "Failed to fetch US intensity stocks" },
      { status: 500, headers }
    );
  }
}
