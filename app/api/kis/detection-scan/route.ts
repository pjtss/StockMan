import { NextResponse } from "next/server";
import { getAccessToken } from "@/lib/kis-token";
import { fetchDomesticFluctuation, fetchDomesticTradeValueRanking } from "@/lib/kis-domestic-api";
import { fetchForeignInstitutionTotal, fetchMarketCapRanking, fetchMarketValueRanking, fetchNearNewHighLow } from "@/lib/kis-investor-flow";
import { writeKisSignalSnapshot } from "@/lib/kis-signal-snapshot";

export const dynamic = "force-dynamic";
// 종목 탐지에 직접 기여하는 KIS 공식 후보군을 통합한다.
// 호출량과 KIS rate limit을 고려해 한 요청에서는 최대 8개까지만 병합한다.
const ALLOWED_SOURCES = ["trade-value", "volume-power", "fluctuation", "foreign-institution", "near-high", "near-low", "market-value", "market-cap"] as const;
const DEFAULT_SOURCES = ["trade-value", "volume-power", "fluctuation", "foreign-institution", "near-high", "market-value"] as const;
type Source = typeof ALLOWED_SOURCES[number];

function codeOf(row: Record<string, unknown>) {
  return String(row.code ?? row.mksc_shrn_iscd ?? row.stck_shrn_iscd ?? row.hts_kor_iscd ?? "").trim();
}

function nameOf(row: Record<string, unknown>) {
  return String(row.name ?? row.hts_kor_isnm ?? row.hts_kor_shr_nlen ?? "").trim() || null;
}

function marketCapOf(row: Record<string, unknown>) {
  const value = row.marketCap ?? row.stck_avls ?? row.mrkt_cap ?? row.market_cap;
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const parsed = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requested = (url.searchParams.get("sources") ?? DEFAULT_SOURCES.join(",")).split(",").map((item) => item.trim()).filter(Boolean);
  const sources = requested.filter((item): item is Source => (ALLOWED_SOURCES as readonly string[]).includes(item)).slice(0, 8);
  const collectedAt = new Date().toISOString();
  if (sources.length === 0) return NextResponse.json({ ok: false, error: "INVALID_SOURCES", sources: DEFAULT_SOURCES, collectedAt }, { status: 400 });
  const token = await getAccessToken();
  if (!token) return NextResponse.json({ ok: false, error: "KIS_TOKEN_UNAVAILABLE", source: "KIS", collectedAt }, { status: 503 });

  try {
    const sourceRows = new Map<Source, Record<string, unknown>[]>();
    for (const source of sources) {
      if (source === "trade-value") {
        const rows = await fetchDomesticTradeValueRanking(token);
        sourceRows.set(source, rows as unknown as Record<string, unknown>[]);
      } else if (source === "fluctuation") {
        const rows = await fetchDomesticFluctuation(token);
        sourceRows.set(source, rows as unknown as Record<string, unknown>[]);
      } else if (source === "foreign-institution") {
        const result = await fetchForeignInstitutionTotal(token, "V");
        sourceRows.set(source, result.rows as Record<string, unknown>[]);
      } else if (source === "near-high" || source === "near-low") {
        const result = await fetchNearNewHighLow(token, "0000", source === "near-high" ? "high" : "low");
        sourceRows.set(source, result.rows as Record<string, unknown>[]);
      } else {
        const result = source === "market-cap"
          ? await fetchMarketCapRanking(token, "J")
          : await fetchMarketValueRanking(token, String(new Date().getFullYear() - 1), "J");
        sourceRows.set(source, result.rows as Record<string, unknown>[]);
      }
    }
    const byCode = new Map<string, { code: string; name: string | null; sources: string[]; score: number; rankBySource: Record<string, unknown>; observedAt: string }>();
    for (const [source, rows] of sourceRows) {
      rows.forEach((row, index) => {
        const code = codeOf(row);
        if (!/^\d{6}$/.test(code)) return;
        const marketCap = marketCapOf(row);
        if (marketCap !== null && marketCap <= 300) return;
        const current = byCode.get(code) ?? { code, name: nameOf(row), sources: [], score: 0, rankBySource: {}, observedAt: collectedAt };
        if (!current.sources.includes(source)) current.sources.push(source);
        current.score += Math.max(1, 10 - Math.min(index, 9));
        current.rankBySource[source] = row.rank ?? row.data_rank ?? index + 1;
        if (!current.name) current.name = nameOf(row);
        byCode.set(code, current);
      });
    }
    const rows = [...byCode.values()].sort((a, b) => b.sources.length - a.sources.length || b.score - a.score).map((row, index) => ({ ...row, rank: index + 1 }));
    await writeKisSignalSnapshot({ market: "KR", code: "0000", signalType: "detection_scan", status: "AVAILABLE", observedAt: new Date(collectedAt), payload: { sources, rows } });
    return NextResponse.json({ ok: true, source: "KIS", market: "KR", collectedAt, sources, rows, filter: { marketCapFloorInBillionWon: 300 }, diagnostics: { sourceCount: sources.length, candidateCount: rows.length, maxSourcesPerRequest: 8 } });
  } catch (error) {
    return NextResponse.json({ ok: false, source: "KIS", collectedAt, error: error instanceof Error ? error.message.slice(0, 500) : "KIS_REQUEST_FAILED" }, { status: 502 });
  }
}
