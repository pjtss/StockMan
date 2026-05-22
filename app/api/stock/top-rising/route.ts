import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { topRisingStocks } from "@/lib/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = getDb();
    if (!db) {
      return NextResponse.json({ error: "Database not connected" }, { status: 500 });
    }

    const records = await db.select().from(topRisingStocks);

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
