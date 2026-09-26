import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { resolveSecCikTickers, resolveSecTickerCandidates, selectPreferredSecCompanyTicker } from "@/lib/sec-company-ticker";
import { filterActiveSecCommonStocks } from "@/lib/sec-company-facts-eligibility";
import { loadSecCompanyFactsSnapshot } from "@/lib/sec-company-facts-persistence";
import { syncSecCompanyFacts } from "@/lib/sec-company-facts-sync";
import { normalizeSecCiks } from "@/lib/sec-edgar-config";
import { describeError, isSchemaError } from "@/lib/error-diagnostics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await requireAdminSession())) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  const cik = normalizeSecCiks(new URL(request.url).searchParams.get("cik"))[0];
  if (!cik) return NextResponse.json({ ok: false, error: "유효한 CIK가 필요합니다." }, { status: 400 });
  try {
    const eligible = await filterActiveSecCommonStocks(await resolveSecCikTickers(cik));
    if (!eligible.length) return NextResponse.json({ ok: false, error: "활성 보통주로 확인되지 않아 조회를 차단했습니다." }, { status: 422 });
    const snapshot = await loadSecCompanyFactsSnapshot(cik);
    if (!snapshot) return NextResponse.json({ ok: false, error: "저장된 Company Facts를 찾지 못했습니다." }, { status: 404 });
    return NextResponse.json({ ok: true, snapshot });
  } catch (error) {
    const diagnostics = describeError(error);
    return NextResponse.json({ ok: false, stage: "database_read", ...diagnostics }, { status: isSchemaError(error) ? 503 : 500 });
  }
}

export async function POST(request: Request) {
  if (!(await requireAdminSession())) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  let body: { query?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: "JSON 요청 본문이 필요합니다." }, { status: 400 }); }
  const query = String(body.query ?? "").trim();
  if (!query || query.length > 50) return NextResponse.json({ ok: false, error: "티커 또는 CIK를 입력해 주세요." }, { status: 400 });

  let cik = "";
  let mapping: { cik: string; name: string; ticker: string; exchange: string; market: string; universeCode: string; universeName: string } | null = null;
  try {
    const requestedCik = /^\d+$/.test(query) ? normalizeSecCiks(query)[0] || "" : "";
    const rows = requestedCik ? await resolveSecCikTickers(requestedCik) : await resolveSecTickerCandidates(query);
    if (!rows.length) return NextResponse.json({ ok: false, stage: "ticker_mapping", error: `SEC 티커/CIK 매핑을 찾을 수 없습니다: ${query}` }, { status: 404 });
    const eligible = await filterActiveSecCommonStocks(rows);
    if (!eligible.length) return NextResponse.json({ ok: false, stage: "common_stock_eligibility", error: "활성 보통주로 확인되지 않았습니다. ETF·펀드·워런트·우선주·비활성 종목은 조회하지 않습니다.", eligibility: { source: "us_common_stock_universe", activeOnly: true, failClosed: true } }, { status: 422 });
    const preferred = requestedCik ? selectPreferredSecCompanyTicker(eligible, requestedCik) : null;
    mapping = preferred ? eligible.find((row) => row.cik === preferred.cik && row.ticker === preferred.ticker) || eligible[0] : eligible[0];
    if (!mapping) return NextResponse.json({ ok: false, stage: "common_stock_eligibility", error: "활성 보통주 티커를 선택하지 못했습니다." }, { status: 422 });
    cik = mapping.cik;

    const result = await syncSecCompanyFacts(cik);
    if (!result.ok) return NextResponse.json({ ok: false, stage: "sec_fetch", query, cik, mapping, result }, { status: result.status >= 400 ? 502 : 503 });
    return NextResponse.json({ ok: true, query, cik, mapping, result, checkedAt: new Date().toISOString() });
  } catch (error) {
    const diagnostics = describeError(error);
    return NextResponse.json({ ok: false, stage: isSchemaError(error) ? "database_persist" : "sec_fetch_or_ticker_mapping", query, cik, mapping, ...diagnostics }, { status: isSchemaError(error) ? 503 : 502 });
  }
}
