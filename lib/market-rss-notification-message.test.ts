import { describe, expect, it } from "vitest";
import { buildMarketRssDiscordNotificationBody, buildMarketRssDiscordNotificationPayload } from "./market-rss-notification-message";
import { parseMarketRss } from "./market-rss";

const article = {
  title: "Revenue rises 20%",
  translatedTitle: "매출 20% 증가",
  link: "https://example.com/article",
  publishedAt: new Date("2026-09-25T01:00:00.000Z"),
  source: "NASDAQ",
  translationFallback: false,
  translationStatus: "TRANSLATED",
  translationError: null,
  translationSkippedReason: null,
  notifyEligible: true,
  isBacklog: false,
  detectedTicker: "TEST",
};

describe("market RSS Discord notification message", () => {
  it("shows the translated title and market metadata without repeating the source title", () => {
    const body = buildMarketRssDiscordNotificationBody(article, {
      cik: "1", ticker: "TEST", exchange: "NASDAQ", market: "NAS", ok: true, rate: 2.5, tradingValue: 120000,
    });

    expect(body).toContain("매출 20% 증가");
    expect(body).not.toContain("Revenue rises 20%");
    expect(body).toContain("티커: TEST · NASDAQ");
    expect(body).toContain("등락률: 2.5% · 거래대금: 120000달러");
    expect(body).not.toContain("fallback");
  });

  it("uses localized fallback reason and avoids leaking reason codes", () => {
    const body = buildMarketRssDiscordNotificationBody({
      ...article,
      translatedTitle: article.title,
      translationFallback: true,
      translationStatus: "SKIPPED",
      translationSkippedReason: "cloud_translation_not_configured",
    }, null);

    expect(body).toContain("번역 상태: 원문 fallback · 번역 설정 누락");
    expect(body).not.toContain("cloud_translation_not_configured");
    expect(body).not.toContain("번역 결과가 원문과 동일");
  });

  it("explains a missing Korean translation in Discord without exposing the internal reason", () => {
    const body = buildMarketRssDiscordNotificationBody({
      ...article,
      translatedTitle: article.title,
      translationFallback: true,
      translationStatus: "SKIPPED",
      translationSkippedReason: "target_language_not_detected",
    }, null);

    expect(body).toContain("번역 상태: 원문 fallback · 한국어 번역 결과 확인 실패");
    expect(body).not.toContain("target_language_not_detected");
  });

  it("explains Google daily quota fallback without leaking provider reason codes", () => {
    const body = buildMarketRssDiscordNotificationBody({
      ...article,
      translatedTitle: article.title,
      translationFallback: true,
      translationStatus: "SKIPPED",
      translationSkippedReason: "provider_daily_quota_exceeded",
    }, null);

    expect(body).toContain("번역 상태: 원문 fallback · Google 일일 번역 한도 도달");
    expect(body).not.toContain("provider_daily_quota_exceeded");
    expect(body).not.toContain("dailyLimitExceeded");
  });

  it("keeps a suspected incomplete candidate out of Discord and explains that the source title is used", () => {
    const body = buildMarketRssDiscordNotificationBody({
      ...article,
      title: "Nvidia revenue rises sharply after earnings",
      translatedTitle: "매출 증가",
      translationFallback: true,
      translationStatus: "SKIPPED",
      translationSkippedReason: "translation_output_incomplete",
    }, null);

    expect(body).toContain("**Nvidia revenue rises sharply after earnings**");
    expect(body).toContain("번역 상태: 원문 fallback · 제목 일부만 번역된 것으로 보여 재시도 대기");
    expect(body).not.toContain("매출 증가");
    expect(body).not.toContain("translation_output_incomplete");
  });

  it("shows the exact retry state in Discord after retry exhaustion", () => {
    const body = buildMarketRssDiscordNotificationBody({
      ...article,
      title: "Nvidia revenue growth outlook improves after quarterly earnings",
      translatedTitle: "Nvidia revenue growth outlook improves after quarterly earnings",
      translationFallback: true,
      translationStatus: "SKIPPED",
      translationSkippedReason: "translation_output_incomplete",
      translationAttempts: 3,
    }, null);

    expect(body).toContain("번역 상태: 원문 fallback · 제목 일부만 번역된 것으로 보여 재시도 대기 · 자동 재시도 종료 (3/3)");
  });

  it("explains an empty publisher headline as a retryable source-data issue", () => {
    const body = buildMarketRssDiscordNotificationBody({
      ...article,
      title: "",
      translatedTitle: "",
      translationFallback: true,
      translationStatus: "SKIPPED",
      translationSkippedReason: "translation_input_empty",
    }, null);

    expect(body).toContain("번역 상태: 원문 fallback · RSS 제목 내용 없음 · 재수집 후 재시도");
    expect(body).not.toContain("translation_input_empty");
  });

  it("explains malformed provider response structure without exposing internal reason codes", () => {
    const body = buildMarketRssDiscordNotificationBody({
      ...article,
      translatedTitle: article.title,
      translationFallback: true,
      translationStatus: "SKIPPED",
      translationSkippedReason: "translation_response_unparseable",
    }, null);

    expect(body).toContain("번역 상태: 원문 fallback · 번역 응답 형식 확인 실패");
    expect(body).not.toContain("translation_response_unparseable");
  });

  it("distinguishes translation cache/quota preparation failures from Google provider errors", () => {
    const body = buildMarketRssDiscordNotificationBody({
      ...article,
      translatedTitle: article.title,
      translationFallback: true,
      translationStatus: "FAILED",
      translationSkippedReason: "translation_preparation_error",
    }, null);

    expect(body).toContain("번역 상태: 원문 fallback · 번역 cache/quota 준비 오류");
    expect(body).not.toContain("공급자 오류");
    expect(body).not.toContain("translation_preparation_error");
  });

  it("prefers the original title over any stale partial result when fallback is set", () => {
    const body = buildMarketRssDiscordNotificationBody({
      ...article,
      title: "Nvidia revenue rises sharply",
      translatedTitle: "Nvidia revenue rises sharply 상승",
      translationFallback: true,
      translationStatus: "SKIPPED",
      translationSkippedReason: "target_language_not_detected",
    }, null);

    expect(body).toContain("**Nvidia revenue rises sharply**");
    expect(body).not.toContain("Nvidia revenue rises sharply 상승");
    expect(body).toContain("원문 fallback · 한국어 번역 결과 확인 실패");
  });

  it("marks an unchanged provider translation for review without treating it as a fallback", () => {
    const sourceTitle = "Nvidia Announces Quarterly Revenue Results";
    const body = buildMarketRssDiscordNotificationBody({
      ...article,
      title: sourceTitle,
      translatedTitle: sourceTitle,
      translationFallback: false,
      translationStatus: "TRANSLATED",
    }, null);

    expect(body).toContain("번역 상태: 번역 결과가 원문과 동일 · 검토 필요");
    expect(body).not.toContain("원문 fallback");
    expect(body).not.toContain("원문 제목:");
  });

  it("recognizes canonically equivalent Hangul as an unchanged provider translation", () => {
    const sourceTitle = "매출 20% 증가";
    const decomposedTitle = "매출 20% 증가";
    const body = buildMarketRssDiscordNotificationBody({
      ...article,
      title: sourceTitle,
      translatedTitle: decomposedTitle,
      translationFallback: false,
      translationStatus: "TRANSLATED",
    }, null);

    expect(body).toContain("번역 상태: 번역 결과가 원문과 동일 · 검토 필요");
    expect(body).not.toContain("원문 제목:");
  });

  it("does not label an already-Korean headline as fallback or duplicate it", () => {
    const korean = "삼성전자 실적 증가";
    const body = buildMarketRssDiscordNotificationBody({
      ...article,
      title: korean,
      translatedTitle: korean,
      translationFallback: false,
      translationStatus: "SKIPPED",
      translationSkippedReason: "already_in_target_language",
    }, null);

    expect(body).toContain(korean);
    expect(body).not.toContain("원문 제목:");
    expect(body).not.toContain("번역 상태:");
  });

  it("escapes RSS markdown and line controls and rejects non-HTTP article links", () => {
    const body = buildMarketRssDiscordNotificationBody({
      ...article,
      title: "[공식 속보](https://phishing.example)\n@everyone",
      translatedTitle: "[가짜 링크](https://phishing.example)\r\n**매출 급증**",
      source: "**UNKNOWN**",
      link: "javascript:alert(1)",
      translationFallback: false,
    }, null);

    expect(body).toContain("가짜 링크");
    expect(body).not.toContain("공식 속보");
    expect(body).not.toContain("@everyone");
    expect(body).toContain("출처: \\*\\*UNKNOWN\\*\\*");
    expect(body).not.toContain("](javascript:alert(1))");
  });

  it("disables Discord mention parsing for untrusted external RSS content", () => {
    const payload = buildMarketRssDiscordNotificationPayload({
      ...article,
      title: "@everyone market alert",
      translatedTitle: "@here 시장 속보",
    }, null);

    expect(payload.content).not.toContain("@everyone");
    expect(payload.content).toContain("@here");
    expect(payload.allowed_mentions).toEqual({ parse: [] });
  });

  it("keeps an HTTP(S) article link clickable while isolating its markdown destination", () => {
    const body = buildMarketRssDiscordNotificationBody({ ...article, link: "https://example.com/story?id=1&next=%3E" }, null);
    expect(body).toContain("](<https://example.com/story?id=1&next=%3E>)");
  });

  it("keeps XML-escaped RSS query separators clickable in the Discord article link", () => {
    const feed = parseMarketRss('<rss><channel><item><guid>story-xml-link</guid><title>Company revenue rises</title><link>https://example.com/story?id=1&amp;source=rss</link><description>Quarterly outlook improves</description></item></channel></rss>', "TEST", "https://example.com/feed");
    const body = buildMarketRssDiscordNotificationBody({ ...article, ...feed.items[0], translatedTitle: "기업 매출 증가" }, null);

    expect(body).toContain("**기업 매출 증가**");
    expect(body).toContain("](\u003chttps://example.com/story?id=1&source=rss\u003e)");
    expect(body).not.toContain("&amp;");
  });

  it("removes embedded credentials from publisher URLs before sending them to Discord", () => {
    const body = buildMarketRssDiscordNotificationBody({ ...article, link: "https://rss-user:secret@example.com/story" }, null);
    expect(body).toContain("](<https://example.com/story>)");
    expect(body).not.toContain("rss-user");
    expect(body).not.toContain("secret");
  });

  it("redacts credential-like query parameters while preserving ordinary article parameters", () => {
    const body = buildMarketRssDiscordNotificationBody({
      ...article,
      link: "https://example.com/story?id=123&api_key=private-key&access_token=private-token&monkey=banana",
    }, null);

    expect(body).toContain("id=123");
    expect(body).toContain("api_key=%5Bredacted%5D");
    expect(body).toContain("access_token=%5Bredacted%5D");
    expect(body).toContain("monkey=banana");
    expect(body).not.toContain("private-key");
    expect(body).not.toContain("private-token");
  });

  it("bounds oversized RSS text and links without truncating required source and translation status", () => {
    const body = buildMarketRssDiscordNotificationBody({
      ...article,
      title: "🚨".repeat(5_000),
      translatedTitle: "매출 증가",
      translationFallback: true,
      translationStatus: "SKIPPED",
      translationSkippedReason: "cloud_translation_not_configured",
      source: "NASDAQ".repeat(1_000),
      link: `https://example.com/story?id=${"x".repeat(2_000)}`,
    }, null);

    expect(Array.from(body).length).toBeLessThanOrEqual(2_000);
    expect(body).toContain("출처:");
    expect(body).toContain("번역 상태: 원문 fallback · 번역 설정 누락");
    expect(body).not.toContain("id=");
  });
});
