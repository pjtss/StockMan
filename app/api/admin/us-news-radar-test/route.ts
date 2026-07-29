import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { detectNewsCandidates } from "@/lib/kis-news-radar";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await requireAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await detectNewsCandidates();
    const sourceStats = Object.entries(result.radar.reduce<Record<string, { total: number; withTicker: number }>>((stats, item) => {
      const source = item.source || "UNKNOWN";
      const current = stats[source] || { total: 0, withTicker: 0 };
      current.total += 1;
      if (item.symbols.length > 0) current.withTicker += 1;
      stats[source] = current;
      return stats;
    }, {})).sort((a, b) => b[1].total - a[1].total).map(([source, counts]) => ({ source, ...counts }));
    const verifiedSourceStats = Object.entries(result.candidates.flatMap((item) => item.verified).reduce<Record<string, number>>((stats, item) => {
      const source = item.source || "UNKNOWN";
      stats[source] = (stats[source] || 0) + 1;
      return stats;
    }, {})).sort((a, b) => b[1] - a[1]).map(([source, count]) => ({ source, count }));
    return NextResponse.json({ ok: true, radarCount: result.radar.length, candidateCount: result.candidates.length, verifiedCount: result.candidates.filter((item) => item.valid).length, sourceStats, verifiedSourceStats, candidates: result.candidates });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 502 });
  }
}
