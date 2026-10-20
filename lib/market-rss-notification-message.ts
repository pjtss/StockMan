import type { MarketNewsReaction } from "./market-news-market-reaction";
import { areMarketRssTitlesEquivalent, getMarketRssTranslationDisplay } from "./market-rss-translation-label";
import { getMarketRssDisplayTitle } from "./market-rss-display-title";

type MarketRssNotificationArticle = {
  title: string;
  translatedTitle: string | null;
  link: string;
  publishedAt: Date | null;
  source: string;
  translationFallback: boolean;
  translationStatus: string;
  translationError: string | null;
  translationSkippedReason: string | null;
  translationAttempts?: number;
  notifyEligible: boolean;
  isBacklog: boolean;
  detectedTicker: string | null;
};

export const DISCORD_SUPPRESS_EMBEDS_FLAG = 1 << 2;

function sanitizeDiscordText(value: string) {
  return value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/([\\`*_~|>\[\]()])/g, "\\$1");
}

function boundedDiscordText(value: string, maxCharacters: number) {
  const sanitized = sanitizeDiscordText(value);
  const characters = Array.from(sanitized);
  return characters.length > maxCharacters ? `${characters.slice(0, maxCharacters - 1).join("")}…` : sanitized;
}

function safeArticleUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.username = "";
    url.password = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/(^|[_-])(?:api[_-]?key|access[_-]?token|key|token|secret|auth(?:orization)?|credential|signature|sig)([_-]|$)/i.test(key)) {
        url.searchParams.set(key, "[redacted]");
      }
    }
    const href = url.href;
    return Array.from(href).length <= 500 ? href : null;
  } catch {
    return null;
  }
}

export function buildMarketRssDiscordNotificationBody(row: MarketRssNotificationArticle, reaction: MarketNewsReaction | null) {
  const isStockTitan = row.source === "STOCKTITAN";
  const title = getMarketRssDisplayTitle(row);
  const sameTitle = areMarketRssTitlesEquivalent(row.translatedTitle, row.title);
  const unchangedProviderTranslation = !row.translationFallback && row.translationStatus === "TRANSLATED" && sameTitle;
  const safeTitle = boundedDiscordText(title, 450);
  const articleUrl = safeArticleUrl(row.link);
  const titleLine = articleUrl ? `[**${safeTitle}**](<${articleUrl}>)` : `**${safeTitle}**`;
  return [
    "🚨 **해외시장 RSS 속보**",
    titleLine,
    !row.translationFallback && row.translatedTitle && !sameTitle ? `원문 제목: ${boundedDiscordText(row.title, 350)}` : "",
    row.publishedAt ? `발행: ${row.publishedAt.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}` : "",
    isStockTitan ? "" : `출처: ${boundedDiscordText(row.source, 80)}`,
    row.translationFallback ? `번역 상태: ${getMarketRssTranslationDisplay(row).label}` : "",
    unchangedProviderTranslation ? `번역 상태: ${getMarketRssTranslationDisplay(row).label}` : "",
    row.detectedTicker ? `티커: ${boundedDiscordText(row.detectedTicker, 80)}${reaction?.exchange ? ` · ${boundedDiscordText(reaction.exchange, 40)}` : ""}` : "",
    !isStockTitan && reaction?.ok ? `등락률: ${boundedDiscordText(String(reaction.rate ?? "-"), 50)}% · 거래대금: ${boundedDiscordText(String(reaction.tradingValue ?? "-"), 80)}달러` : "",
  ].filter(Boolean).join("\n");
}

/** External RSS text is untrusted; never allow it to trigger Discord mentions. */
export function buildMarketRssDiscordNotificationPayload(row: MarketRssNotificationArticle, reaction: MarketNewsReaction | null) {
  return {
    content: buildMarketRssDiscordNotificationBody(row, reaction),
    allowed_mentions: { parse: [] as string[] },
    // Discord's Execute Webhook flags support SUPPRESS_EMBEDS (1 << 2).
    ...(row.source === "STOCKTITAN" ? { flags: DISCORD_SUPPRESS_EMBEDS_FLAG } : {}),
  };
}
