import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { topRisingStocks } from "@/lib/schema";
import { syncTopRisingStocks } from "@/lib/kis";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = getDb();
    if (!db) {
      return NextResponse.json({ error: "Database not connected" }, { status: 500 });
    }

    let records = await db.select().from(topRisingStocks);

    // 1. DB가 비어있는 경우, 자동으로 최신 KIS TOP 10 동기화 트리거
    if (records.length === 0) {
      try {
        await syncTopRisingStocks();
        records = await db.select().from(topRisingStocks);
      } catch (syncErr) {
        console.warn("[KIS] Auto sync on empty DB failed:", syncErr);
      }
    }

    if (records.length === 0) {
      const mockInitial = Array.from({ length: 10 }, (_, i) => {
        const baseRate = 29.5 - i * 2.1;
        return {
          code: (i + 1).toString().padStart(6, "0"),
          company: `시뮬레이션 종목 ${String.fromCharCode(65 + i)}`,
          changeRate: `+${baseRate.toFixed(2)}%`,
          price: (35000 - i * 2200).toLocaleString(),
          addedAt: new Date(),
        };
      });

      try {
        await db.insert(topRisingStocks).values(mockInitial);
        records = await db.select().from(topRisingStocks);
      } catch (dbSeedErr) {
        console.error("[KIS] Self-Healing Seed insertion failed:", dbSeedErr);
      }
    }

    // 등락률 숫자 기준으로 내림차순 정렬
    const sortedRecords = records.sort((a, b) => {
      const rateA = parseFloat(a.changeRate.replace(/[+%]/g, "")) || 0;
      const rateB = parseFloat(b.changeRate.replace(/[+%]/g, "")) || 0;
      return rateB - rateA;
    });

    return NextResponse.json(sortedRecords);
  } catch (error) {
    console.error("Failed to fetch top rising stocks:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
