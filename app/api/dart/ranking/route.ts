import { NextResponse } from "next/server";
import { fetchDartFeed } from "@/lib/rss";
import { calculateDartScore } from "@/lib/scoring";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const payload = await fetchDartFeed();

    const ranked = payload.items
      .map((item) => {
        const { score } = calculateDartScore(item.title);
        return { ...item, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 20); // 상위 20건

    return NextResponse.json({
      fetchedAt: payload.fetchedAt,
      items: ranked,
    });
  } catch (error) {
    console.error("[API /dart/ranking] Error:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "DART 순위 데이터를 불러오지 못했습니다." }, { status: 503 });
  }
}
