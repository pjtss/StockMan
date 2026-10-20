import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  claim: vi.fn(),
  markSending: vi.fn(),
  persistOutcome: vi.fn(),
  getArticleSnapshot: vi.fn(),
  supersede: vi.fn(),
  skip: vi.fn(),
  loadWebhook: vi.fn(),
  loadDebugWebhook: vi.fn(),
  updateWhere: vi.fn(),
}));

const retrySnapshot = {
  source: "SEC_EDGAR",
  title: "Revenue rises",
  summary: "Raised guidance",
  translatedTitle: "매출 증가",
  translationStatus: "TRANSLATED",
  translationFallback: false,
  translationSkippedReason: null,
  translationError: null,
  detectedTicker: "TEST",
  link: "https://example.com/story",
  publishedAt: null,
};

vi.mock("@/lib/discord-delivery-queue", () => ({
  claimDueDiscordDeliveries: mocks.claim,
  markDiscordDeliverySending: mocks.markSending,
  getMarketRssDeliveryArticleSnapshot: mocks.getArticleSnapshot,
  markDiscordDeliverySuperseded: mocks.supersede,
  markDiscordDeliverySkipped: mocks.skip,
  persistDiscordDeliveryOutcome: mocks.persistOutcome,
}));
vi.mock("@/lib/discord-config", () => ({
  loadFeatureDiscordWebhook: mocks.loadWebhook,
  loadFeatureDiscordDebugWebhook: mocks.loadDebugWebhook,
}));
import { retryDiscordDeliveries } from "./discord-delivery-retry";
import { buildMarketRssDiscordNotificationBody } from "./market-rss-notification-message";

describe("Discord delivery retry worker", () => {
  const claimedAt = new Date("2026-09-25T12:00:00Z");
  const sendingAt = new Date("2026-09-25T12:00:01Z");
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    mocks.claim.mockReset();
    mocks.markSending.mockReset().mockResolvedValue(sendingAt);
    mocks.persistOutcome.mockReset().mockResolvedValue(undefined);
    mocks.getArticleSnapshot.mockReset().mockResolvedValue(null);
    mocks.supersede.mockReset().mockResolvedValue(undefined);
    mocks.skip.mockReset().mockResolvedValue(undefined);
    mocks.loadWebhook.mockReset().mockResolvedValue("https://discord.example/webhook");
    mocks.loadDebugWebhook.mockReset().mockResolvedValue("");
    mocks.claim.mockResolvedValue({ deliveries: [{
        id: 1,
        externalId: "MARKET_RSS:10:1",
        channelKey: "MARKET_RSS",
        payload: { content: "test", _marketRssSnapshot: retrySnapshot },
        attempts: 0,
        updatedAt: claimedAt,
      }], staleRecovered: 0, uncertain: 0 });
    mocks.getArticleSnapshot.mockResolvedValue(retrySnapshot);
  });

  it("terminates permanent 4xx payload errors instead of requeueing them", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("invalid payload", { status: 400 })));

    const result = await retryDiscordDeliveries();

    expect(result).toMatchObject({ failed: 1, permanentFailed: 1, repeatedFailure: 0 });
    expect(mocks.persistOutcome).toHaveBeenCalledWith({ id: 1, articleId: 10, status: "FAILED", attempts: 1, claimedAt: sendingAt, expectedStatus: "SENDING", error: "Discord HTTP 400" });
  });

  it("requeues transient 5xx failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("temporary", { status: 503 })));

    const result = await retryDiscordDeliveries();

    expect(result).toMatchObject({ failed: 1, permanentFailed: 0 });
    expect(mocks.persistOutcome).toHaveBeenCalledWith({ id: 1, articleId: 10, status: "PENDING", attempts: 1, claimedAt: sendingAt, expectedStatus: "SENDING", error: "Discord HTTP 503" });
  });

  it("treats even a null rejection as a send failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(null));

    const result = await retryDiscordDeliveries();

    expect(result).toMatchObject({ failed: 1, sent: 0 });
    expect(mocks.persistOutcome).toHaveBeenCalledWith({ id: 1, articleId: 10, status: "PENDING", attempts: 1, claimedAt: sendingAt, expectedStatus: "SENDING", error: "null" });
  });

  it("persists queue SENT and RSS article SENT as a single outcome operation", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));

    const result = await retryDiscordDeliveries();

    expect(result).toMatchObject({ sent: 1, persistenceFailed: 0 });
    expect(mocks.persistOutcome).toHaveBeenCalledWith({ id: 1, articleId: 10, status: "SENT", attempts: 1, claimedAt: sendingAt, expectedStatus: "SENDING" });
  });

  it("requests Discord confirmation on retry and preserves the RSS translation review marker", async () => {
    const sourceTitle = "Nvidia Announces Quarterly Revenue Results";
    const rowSnapshot = {
      source: "SEC_EDGAR",
      title: sourceTitle,
      summary: "",
      translatedTitle: sourceTitle,
      translationStatus: "TRANSLATED",
      translationFallback: false,
      translationSkippedReason: null,
      translationError: null,
      detectedTicker: null,
      link: "https://example.com/article",
      publishedAt: null,
    };
    const content = buildMarketRssDiscordNotificationBody({
      title: sourceTitle,
      translatedTitle: sourceTitle,
      link: "https://example.com/article",
      publishedAt: null,
      source: "SEC_EDGAR",
      translationFallback: false,
      translationStatus: "TRANSLATED",
      translationError: null,
      translationSkippedReason: null,
      notifyEligible: true,
      isBacklog: false,
      detectedTicker: null,
    }, null);
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    mocks.getArticleSnapshot.mockResolvedValueOnce(rowSnapshot);
    mocks.claim.mockResolvedValueOnce({ deliveries: [{
      id: 2,
      externalId: "MARKET_RSS:11:1",
      channelKey: "MARKET_RSS",
      payload: { content, allowed_mentions: { parse: [] }, _marketRssSnapshot: rowSnapshot },
      attempts: 1,
      updatedAt: claimedAt,
    }], staleRecovered: 0, uncertain: 0 });

    const result = await retryDiscordDeliveries();

    expect(result.sent).toBe(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://discord.example/webhook?wait=true");
    const sentPayload = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(sentPayload.content).toContain("번역 결과가 원문과 동일 · 검토 필요");
    expect(sentPayload.allowed_mentions).toEqual({ parse: [] });
    expect(sentPayload).not.toHaveProperty("_marketRssSnapshot");
  });

  it("does not resend a legacy RSS queue item without a verifiable snapshot", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    mocks.claim.mockResolvedValueOnce({ deliveries: [{
      id: 10,
      externalId: "MARKET_RSS:14:1",
      channelKey: "MARKET_RSS",
      payload: { content: "possibly obsolete title" },
      attempts: 1,
      updatedAt: claimedAt,
    }], staleRecovered: 0, uncertain: 0 });
    mocks.getArticleSnapshot.mockResolvedValueOnce({
      source: "SEC_EDGAR",
      title: "Current source title",
      summary: "",
      translatedTitle: "현재 번역 제목",
      translationStatus: "TRANSLATED",
      translationFallback: false,
      translationSkippedReason: null,
      translationError: null,
      detectedTicker: null,
      link: "https://example.com/article",
      publishedAt: null,
    });

    const result = await retryDiscordDeliveries();

    expect(result.superseded).toBe(1);
    expect(mocks.supersede).toHaveBeenCalledWith({ id: 10, articleId: 14, claimedAt });
    expect(mocks.markSending).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("retires a queued RSS retry and returns the article to PENDING when its translation snapshot changed", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const snapshot = {
      source: "SEC_EDGAR",
      title: "Revenue rises",
      summary: "Raised guidance",
      translatedTitle: "매출 증가",
      translationStatus: "TRANSLATED",
      translationFallback: false,
      translationSkippedReason: null,
      translationError: null,
      detectedTicker: "TEST",
      link: "https://example.com/article",
      publishedAt: null,
    };
    mocks.claim.mockResolvedValueOnce({ deliveries: [{
      id: 8,
      externalId: "MARKET_RSS:12:1",
      channelKey: "MARKET_RSS",
      payload: { content: "구 번역 알림", _marketRssSnapshot: snapshot },
      attempts: 1,
      updatedAt: claimedAt,
    }], staleRecovered: 0, uncertain: 0 });
    mocks.getArticleSnapshot.mockResolvedValueOnce({ ...snapshot, translatedTitle: "매출 전망 개선" });

    const result = await retryDiscordDeliveries();

    expect(result).toMatchObject({ superseded: 1, sent: 0, failed: 0 });
    expect(mocks.supersede).toHaveBeenCalledWith({ id: 8, articleId: 12, claimedAt });
    expect(mocks.markSending).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("skips retries when the current RSS source is not allowlisted", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    mocks.getArticleSnapshot.mockResolvedValueOnce({ ...retrySnapshot, source: "NASDAQ" });

    const result = await retryDiscordDeliveries();

    expect(result).toMatchObject({ superseded: 1, sent: 0, failed: 0 });
    expect(mocks.skip).toHaveBeenCalledWith(1, "source_not_allowed_for_discord", 10);
    expect(mocks.markSending).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not send a snapshotted RSS retry when the article cannot be fetched for verification", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const snapshot = {
      source: "SEC_EDGAR",
      title: "Revenue rises",
      summary: "Raised guidance",
      translatedTitle: "매출 증가",
      translationStatus: "TRANSLATED",
      translationFallback: false,
      translationSkippedReason: null,
      translationError: null,
      detectedTicker: null,
      link: "https://example.com/article",
      publishedAt: null,
    };
    mocks.claim.mockResolvedValueOnce({ deliveries: [{
      id: 9,
      externalId: "MARKET_RSS:13:1",
      channelKey: "MARKET_RSS",
      payload: { content: "번역 알림", _marketRssSnapshot: snapshot },
      attempts: 1,
      updatedAt: claimedAt,
    }], staleRecovered: 0, uncertain: 0 });
    mocks.getArticleSnapshot.mockRejectedValueOnce(new Error("database unavailable"));

    const result = await retryDiscordDeliveries();

    expect(result).toMatchObject({ persistenceFailed: 1, sent: 0 });
    expect(mocks.markSending).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not immediately requeue when Discord accepted but outcome persistence fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    mocks.persistOutcome.mockRejectedValueOnce(new Error("database unavailable"));

    const result = await retryDiscordDeliveries();

    expect(result).toMatchObject({ sent: 0, persistenceFailed: 1 });
    expect(mocks.persistOutcome).toHaveBeenCalledOnce();
  });

  it("reports stale SENDING deliveries as uncertain without automatically retrying", async () => {
    mocks.claim.mockResolvedValueOnce({ deliveries: [], staleRecovered: 1, uncertain: 2 });

    const result = await retryDiscordDeliveries();

    expect(result).toMatchObject({ claimed: 0, staleRecovered: 1, uncertain: 2 });
    expect(mocks.markSending).not.toHaveBeenCalled();
    expect(mocks.persistOutcome).not.toHaveBeenCalled();
  });
});
