import { describe, expect, it, vi } from "vitest";
import { deliverMarketRssDiscordNotification, type MarketRssDiscordPayload } from "./market-rss-notification-delivery";

const payload: MarketRssDiscordPayload = {
  content: "🚨 **해외시장 RSS 속보**\n@everyone 매출 상승",
  allowed_mentions: { parse: [] },
};

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    claimProcessing: vi.fn(async () => true),
    markSending: vi.fn(async () => true),
    send: vi.fn(async () => undefined),
    markFailed: vi.fn(async () => undefined),
    isRetryable: vi.fn(() => true),
    enqueue: vi.fn(async () => undefined),
    markQueueEnqueueFailed: vi.fn(async () => undefined),
    markSent: vi.fn(async () => undefined),
    ...overrides,
  } as Parameters<typeof deliverMarketRssDiscordNotification>[1];
}

describe("market RSS notification delivery flow", () => {
  it("does not send when the pending row could not be claimed", async () => {
    const deps = dependencies({ claimProcessing: vi.fn(async () => false) });

    const result = await deliverMarketRssDiscordNotification({ notificationAttempts: 0, payload }, deps);

    expect(result).toEqual({ claimedForSend: false, sent: false, queueEnqueueFailed: false });
    expect(deps.markSending).not.toHaveBeenCalled();
    expect(deps.send).not.toHaveBeenCalled();
  });

  it("does not send or queue when the SENDING lease cannot be acquired", async () => {
    const deps = dependencies({ markSending: vi.fn(async () => false) });

    const result = await deliverMarketRssDiscordNotification({ notificationAttempts: 1, payload }, deps);

    expect(result.claimedForSend).toBe(false);
    expect(deps.send).not.toHaveBeenCalled();
    expect(deps.enqueue).not.toHaveBeenCalled();
  });

  it("marks successful sends SENT only after transport accepts the shared payload", async () => {
    const deps = dependencies();

    const result = await deliverMarketRssDiscordNotification({ notificationAttempts: 2, payload }, deps);

    expect(result).toEqual({ claimedForSend: true, sent: true, queueEnqueueFailed: false });
    expect(deps.send).toHaveBeenCalledWith(payload);
    expect(deps.markSent).toHaveBeenCalledWith(3);
    expect(deps.markFailed).not.toHaveBeenCalled();
    expect(deps.enqueue).not.toHaveBeenCalled();
  });

  it("does not retry when Discord accepted the POST but SENT persistence failed", async () => {
    const persistenceError = new Error("database unavailable after Discord accepted the message");
    const deps = dependencies({ markSent: vi.fn(async () => { throw persistenceError; }) });

    await expect(deliverMarketRssDiscordNotification({ notificationAttempts: 0, payload }, deps)).rejects.toBe(persistenceError);

    expect(deps.send).toHaveBeenCalledOnce();
    expect(deps.markFailed).not.toHaveBeenCalled();
    expect(deps.enqueue).not.toHaveBeenCalled();
  });

  it("queues the exact initial payload and next attempt after a retryable transport failure", async () => {
    const error = new Error("Discord HTTP 503");
    const deps = dependencies({ send: vi.fn(async () => { throw error; }) });

    const result = await deliverMarketRssDiscordNotification({ notificationAttempts: 1, payload }, deps);

    expect(result).toEqual({ claimedForSend: true, sent: false, queueEnqueueFailed: false });
    expect(deps.markFailed).toHaveBeenCalledWith(2, error);
    expect(deps.enqueue).toHaveBeenCalledWith(payload, 2);
    expect(deps.markSent).not.toHaveBeenCalled();
    expect(payload.allowed_mentions).toEqual({ parse: [] });
  });

  it("does not enqueue a permanent transport failure", async () => {
    const error = new Error("Discord HTTP 400");
    const deps = dependencies({ send: vi.fn(async () => { throw error; }), isRetryable: vi.fn(() => false) });

    const result = await deliverMarketRssDiscordNotification({ notificationAttempts: 0, payload }, deps);

    expect(result).toEqual({ claimedForSend: true, sent: false, queueEnqueueFailed: false });
    expect(deps.markFailed).toHaveBeenCalledWith(1, error);
    expect(deps.enqueue).not.toHaveBeenCalled();
  });

  it("records queue enqueue failure so the article can be returned to a retryable state", async () => {
    const transportError = new Error("network timeout");
    const queueError = new Error("database unavailable");
    const deps = dependencies({
      send: vi.fn(async () => { throw transportError; }),
      enqueue: vi.fn(async () => { throw queueError; }),
    });

    const result = await deliverMarketRssDiscordNotification({ notificationAttempts: 0, payload }, deps);

    expect(result).toEqual({ claimedForSend: true, sent: false, queueEnqueueFailed: true });
    expect(deps.markFailed).toHaveBeenCalledWith(1, transportError);
    expect(deps.markQueueEnqueueFailed).toHaveBeenCalledWith(1, queueError);
  });
});
