export type MarketRssDiscordPayload = {
  content: string;
  allowed_mentions: { parse: string[] };
  flags?: number;
};

type MarketRssNotificationDeliveryDependencies = {
  claimProcessing: () => Promise<boolean>;
  markSending: () => Promise<boolean>;
  send: (payload: MarketRssDiscordPayload) => Promise<void>;
  markFailed: (attempt: number, error: unknown) => Promise<void>;
  isRetryable: (error: unknown) => boolean;
  enqueue: (payload: MarketRssDiscordPayload, attempt: number) => Promise<void>;
  markQueueEnqueueFailed: (attempt: number, error: unknown) => Promise<void>;
  markSent: (attempt: number) => Promise<void>;
};

/** Executes the leased first-send flow while keeping DB and transport adapters injectable. */
export async function deliverMarketRssDiscordNotification(input: {
  notificationAttempts: number;
  payload: MarketRssDiscordPayload;
}, dependencies: MarketRssNotificationDeliveryDependencies) {
  if (!await dependencies.claimProcessing()) return { claimedForSend: false, sent: false, queueEnqueueFailed: false };
  if (!await dependencies.markSending()) return { claimedForSend: false, sent: false, queueEnqueueFailed: false };

  const nextAttempt = input.notificationAttempts + 1;
  try {
    await dependencies.send(input.payload);
  } catch (error) {
    await dependencies.markFailed(nextAttempt, error);
    if (!dependencies.isRetryable(error)) return { claimedForSend: true, sent: false, queueEnqueueFailed: false };
    try {
      await dependencies.enqueue(input.payload, nextAttempt);
      return { claimedForSend: true, sent: false, queueEnqueueFailed: false };
    } catch (queueError) {
      await dependencies.markQueueEnqueueFailed(nextAttempt, queueError);
      return { claimedForSend: true, sent: false, queueEnqueueFailed: true };
    }
  }

  await dependencies.markSent(nextAttempt);
  return { claimedForSend: true, sent: true, queueEnqueueFailed: false };
}
