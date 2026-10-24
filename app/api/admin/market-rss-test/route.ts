import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { fetchAllMarketRss, fetchMarketRssSource, MARKET_RSS_SOURCES, type MarketRssSource } from "@/lib/market-rss-sources";
import { translateMarketRssItems } from "@/lib/translate-market-rss-item";
import { previewMarketRssResults } from "@/lib/market-rss-preview";
import { describeError } from "@/lib/error-diagnostics";
import { createMarketRssTranslationClient } from "@/lib/market-rss-translation-client";
import type { TranslationClient } from "@/lib/translation-types";
import { getMarketRssTranslationConfiguration } from "@/lib/market-rss-translation-configuration";
import { TranslationClientOperationError } from "@/lib/translation-types";
import { sanitizeMarketRssTranslationError } from "@/lib/market-rss-translation-retry";
import { getAzureTranslatorEndpointDiagnostics } from "@/lib/azure-translation-client";

const withTranslation = async (feed: Awaited<ReturnType<typeof fetchMarketRssSource>>, translate: boolean, client?: TranslationClient) =>
  translate ? { ...feed, items: await translateMarketRssItems(feed.items, client) } : feed;

export async function GET(request: Request) {
  if (!(await requireAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const requestedSource = params.get("source")?.toUpperCase();
  const translate = params.get("translate") === "true";
  const source = requestedSource || (translate ? "STOCKTITAN" : undefined);
  const mode = (params.get("mode") || "FETCH_ONLY").toUpperCase();
  const requestedLimit = params.get("limit");
  const limit = requestedLimit === null ? null : Number(requestedLimit);
  const includeDiagnostics = params.get("diagnostics") === "true";
  if (mode !== "FETCH_ONLY" && mode !== "PREVIEW") return NextResponse.json({ ok: false, error: "mode는 FETCH_ONLY 또는 PREVIEW만 지원합니다. 실제 저장·전송은 cron COMMIT 경로를 사용합니다." }, { status: 400 });
  if (limit !== null && (!Number.isInteger(limit) || limit < 1 || limit > 100)) return NextResponse.json({ ok: false, error: "limit은 1부터 100 사이의 정수여야 합니다." }, { status: 400 });
  if (includeDiagnostics && (!translate || mode !== "PREVIEW")) return NextResponse.json({ ok: false, error: "diagnostics=true는 번역 PREVIEW 모드에서만 지원합니다." }, { status: 400 });
  if (translate && source !== "STOCKTITAN") return NextResponse.json({ ok: false, error: "번역 테스트는 STOCKTITAN 기사 제목만 지원합니다.", allowedSource: "STOCKTITAN", translatedField: "title" }, { status: 400 });
  if (source && !MARKET_RSS_SOURCES.includes(source as MarketRssSource)) return NextResponse.json({ error: "지원하지 않는 RSS source", sources: MARKET_RSS_SOURCES }, { status: 400 });
  try {
    const providerSet = translate ? createMarketRssTranslationClient({ deferCacheWriteUntilValidated: true }) : null;
    const translationConfiguration = getMarketRssTranslationConfiguration(translate, Boolean(providerSet?.client), providerSet?.configured);
    const tracked = providerSet?.client ? providerSet : null;
    const translationClient = tracked?.client ?? undefined;
    if (!source) {
      const result = await fetchAllMarketRss();
      if (mode === "FETCH_ONLY" && !translate) return NextResponse.json({ ...result, mode });
      const results = await previewMarketRssResults(result.results, false);
      return NextResponse.json({ ...result, mode, results });
    }
    const feed = await fetchMarketRssSource(source as MarketRssSource);
    const limitedFeed = limit === null ? feed : { ...feed, items: feed.items.slice(0, limit) };
    if (mode === "FETCH_ONLY") return NextResponse.json({ fetchedAt: new Date().toISOString(), source, ok: true, mode, translate, translationConfiguration, feed: await withTranslation(limitedFeed, translate, translationClient), ...(tracked ? { translationUsage: tracked.getMetrics() } : {}) });
    const translationDiagnostics: Array<{ itemId: string; stage: string; provider: string | null; message: string }> = [];
    const onItemError = includeDiagnostics ? (item: { id: string }, error: unknown) => {
      const operationError = error instanceof TranslationClientOperationError ? error : null;
      translationDiagnostics.push({ itemId: item.id, stage: operationError?.stage ?? "unknown", provider: operationError?.provider ?? null, message: sanitizeMarketRssTranslationError(error) });
    } : undefined;
    const onProviderFallback = includeDiagnostics ? (item: { id: string }, result: { provider: string; providerFallbackError?: string }) => {
      if (!result.providerFallbackError) return;
      translationDiagnostics.push({ itemId: item.id, stage: "provider_fallback", provider: result.provider, message: sanitizeMarketRssTranslationError(result.providerFallbackError) });
    } : undefined;
    const [preview] = await previewMarketRssResults([{ source, ok: true, feed: limitedFeed }], translate, translationClient, onItemError, onProviderFallback);
    return NextResponse.json({ ...preview, fetchedAt: new Date().toISOString(), mode, translate, translationConfiguration, ...(tracked ? { translationUsage: tracked.getMetrics() } : {}), ...(includeDiagnostics ? { translationDiagnostics, azureEndpoint: getAzureTranslatorEndpointDiagnostics() } : {}) });
  } catch (error) {
    const diagnostics = describeError(error);
    return NextResponse.json({ fetchedAt: new Date().toISOString(), source: source || null, mode, ok: false, stage: mode === "PREVIEW" && translate ? "translation" : "fetch", ...diagnostics }, { status: 502 });
  }
}
