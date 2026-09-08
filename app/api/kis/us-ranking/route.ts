import { NextResponse } from "next/server";
import { fetchKisUsRanking, type KisUsRankingKind, type KisUsTradeMarket } from "@/lib/kis-us-trade-trend";
import { writeKisSignalSnapshot } from "@/lib/kis-signal-snapshot";

export const dynamic = "force-dynamic";
const kinds = new Set<KisUsRankingKind>(["trade-vol", "trade-pbmn", "volume-surge", "volume-power", "new-highlow", "market-cap"]);
const markets = new Set<KisUsTradeMarket>(["NAS", "NYS", "AMS"]);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind") as KisUsRankingKind;
  const market = (url.searchParams.get("market") ?? "NAS") as KisUsTradeMarket;
  if (!kinds.has(kind) || !markets.has(market)) return NextResponse.json({ ok: false, error: "INVALID_RANKING_REQUEST", allowedKinds: [...kinds], allowedMarkets: [...markets] }, { status: 400 });
  const result = await fetchKisUsRanking(kind, market);
  if (!result) return NextResponse.json({ ok: false, error: "KIS_TOKEN_UNAVAILABLE", source: "KIS", market: "US" }, { status: 503 });
  const collectedAt = new Date().toISOString();
  const rows = result.rows.map((row, index) => ({ ...row, rank: row.rank ?? row.data_rank ?? index + 1, code: String(row.code ?? row.symb ?? row.rsym ?? row.symbol ?? "").trim() || null, name: String(row.name ?? row.enname ?? row.rprs_mrkt_name ?? "").trim() || null, observedAt: collectedAt }));
  await writeKisSignalSnapshot({ market: "US", code: "0000", signalType: `candidate_${kind}`, status: result.ok ? "AVAILABLE" : "UNAVAILABLE", observedAt: new Date(collectedAt), payload: rows });
  return NextResponse.json({ ...result, rows, source: "KIS", collectedAt }, { status: result.ok ? 200 : 502 });
}
