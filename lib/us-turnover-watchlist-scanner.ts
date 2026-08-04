import { asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { usInstruments, usTurnoverWatchlist } from "@/lib/schema";
import { fetchKisUsPriceDetail, getKisUsPriceDetailOutput } from "@/lib/kis-us-price-detail";
import { calculateKisUsMarketCap } from "@/lib/kis-us-market-cap";
import { loadUsTurnoverFilterSettings, type UsTurnoverFilterSettings } from "@/lib/us-turnover-settings";
import { explainUsTurnoverFilters } from "@/lib/us-turnover-filter-explanation";
import { saveAndCalculateUsTurnoverRatioTrends } from "@/lib/us-turnover-ratio-trend";
import { sendUsTurnoverRatioToDiscord } from "@/lib/discord-us-turnover-ratio";

type WatchItem = { market: string; code: string; name: string };
export type WatchlistScanResult = {
  ok: boolean; checkedAt: string; watchlistCount: number; attempted: number; detailSuccessCount: number; detailFailureCount: number;
  qualified: ReturnType<typeof explainUsTurnoverFilters> extends infer _T ? Array<Record<string, unknown>> : never;
  steps: Array<{ step: string; count: number; detail?: string }>;
  results: Array<Record<string, unknown>>; settings: UsTurnoverFilterSettings; errors: Array<Record<string, unknown>>;
};

async function loadWatchlist(): Promise<WatchItem[]> {
  const db = getDb();
  if (!db) return [];
  return db.select({ market: usInstruments.market, code: usInstruments.code, name: usInstruments.name })
    .from(usTurnoverWatchlist).innerJoin(usInstruments, eq(usInstruments.id, usTurnoverWatchlist.instrumentId))
    .where(eq(usTurnoverWatchlist.enabled, true)).orderBy(asc(usInstruments.market), asc(usInstruments.code));
}

function num(value: unknown) { const n = Number(String(value ?? "").replace(/,/g, "").replace(/%/g, "")); return Number.isFinite(n) ? n : null; }

export async function scanUsTurnoverWatchlist(options: { send?: boolean } = {}): Promise<WatchlistScanResult> {
  const checkedAt = new Date().toISOString();
  const settings = await loadUsTurnoverFilterSettings();
  const watchlist = await loadWatchlist();
  const steps: WatchlistScanResult["steps"] = [{ step: "활성 관심종목 DB 조회", count: watchlist.length }];
  const results: Array<Record<string, unknown>> = [];
  const errors: Array<Record<string, unknown>> = [];
  for (const item of watchlist) {
    const detail = await fetchKisUsPriceDetail({ market: item.market as "NAS" | "AMS" | "NYS", code: item.code });
    const output = getKisUsPriceDetailOutput(detail?.parsed);
    const marketCap = calculateKisUsMarketCap(output);
    const tradingValue = num(output.tamt ?? output.tamnt);
    const price = num(output.last);
    const rate = num(output.t_xrat);
    const open = num(output.open); const high = num(output.high);
    const openToHighRate = open && high ? ((high - open) / open) * 100 : null;
    const base = { market: item.market, code: item.code, name: item.name, price, rate, marketCap, tradingValue, turnoverRatio: marketCap && tradingValue ? tradingValue / marketCap * 100 : null, openToHighRate, detailOk: Boolean(detail?.ok), status: detail?.status ?? 0, raw: detail?.parsed ?? null };
    if (!detail?.ok || marketCap == null || tradingValue == null || price == null || rate == null || openToHighRate == null) {
      errors.push({ ...base, error: "상세 시세 또는 필수 필드 누락" }); results.push({ ...base, qualifies: false, failedFilters: ["상세 시세/필수 필드"] }); continue;
    }
    const explanation = explainUsTurnoverFilters({ market: item.market, rank: 0, code: item.code, name: item.name, price: String(price), changeRate: String(rate), marketCap, tradingValue, turnoverRatio: base.turnoverRatio as number, openToHighRate }, settings);
    results.push({ ...base, qualifies: explanation.passed, passedFilters: explanation.passedFilters, failedFilters: explanation.failedFilters });
  }
  const qualified = results.filter((row) => row.qualifies);
  steps.push({ step: "KIS 상세 시세 조회 시도", count: watchlist.length });
  steps.push({ step: "KIS 상세 시세 조회 성공", count: results.filter((row) => row.detailOk).length });
  steps.push({ step: "필터 판정 완료", count: results.length });
  steps.push({ step: "최종 유효 후보", count: qualified.length });
  if (options.send && qualified.length) {
    const webhook = process.env.US_TURNOVER_RATIO_WATCHLIST_DISCORD_WEBHOOK_URL?.trim() || process.env.US_TURNOVER_WATCH_DISCORD_WEBHOOK_URL?.trim() || process.env.US_TURNOVER_RATIO_INCREASE_DISCORD_WEBHOOK_URL?.trim() || "";
    if (!webhook) errors.push({ error: "US_TURNOVER_RATIO_WATCHLIST_DISCORD_WEBHOOK_URL 미설정" });
    else {
      const payloadItems = qualified.map((row) => ({ ...row, rank: 0, changeRate: String(row.rate ?? ""), openToHighRate: Number(row.openToHighRate ?? 0) })) as any;
      const sent = await sendUsTurnoverRatioToDiscord(payloadItems, webhook);
      steps.push({ step: "Discord 전송", count: sent?.ok ? qualified.length : 0, detail: sent?.ok ? "성공" : `실패 HTTP ${sent?.status ?? 0}` });
    }
  }
  return { ok: errors.length === 0, checkedAt, watchlistCount: watchlist.length, attempted: watchlist.length, detailSuccessCount: results.filter((row) => row.detailOk).length, detailFailureCount: errors.length, qualified, steps, results, settings, errors };
}
