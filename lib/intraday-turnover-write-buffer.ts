import type { IntradayTurnoverObservation } from "@/lib/intraday-turnover-repository";

export const INTRADAY_TURNOVER_BUFFER_POLICY = Object.freeze({
  maxEntries: 9_000,
  ttlMs: 30 * 60_000,
  retryBaseMs: 1_000,
  retryMaxMs: 30_000,
});

type PendingObservation = { observation: IntradayTurnoverObservation; enqueuedAt: number };

/** Bounded, idempotency-keyed memory buffer for brief local DB write outages. */
export class IntradayTurnoverWriteBuffer {
  private readonly pending = new Map<string, PendingObservation>();
  private retryAt = 0;
  private consecutiveFailures = 0;
  private evictedCount = 0;

  private key(row: IntradayTurnoverObservation) {
    return `${row.market}:${row.code}:${row.sessionDate}:${row.bucketAt.toISOString()}`;
  }

  enqueue(rows: IntradayTurnoverObservation[], now = Date.now()) {
    this.prune(now);
    for (const observation of rows) {
      const key = this.key(observation);
      this.pending.delete(key);
      this.pending.set(key, { observation, enqueuedAt: now });
    }
    while (this.pending.size > INTRADAY_TURNOVER_BUFFER_POLICY.maxEntries) {
      const oldest = this.pending.keys().next().value as string | undefined;
      if (!oldest) break;
      this.pending.delete(oldest);
      this.evictedCount += 1;
    }
    return this.pending.size;
  }

  batch(now = Date.now()) {
    this.prune(now);
    return [...this.pending.values()].map(({ observation }) => observation);
  }

  acknowledge(rows: IntradayTurnoverObservation[]) {
    for (const observation of rows) {
      const key = this.key(observation);
      if (this.pending.get(key)?.observation === observation) this.pending.delete(key);
    }
    if (this.pending.size === 0) this.markSuccess();
    return this.pending.size;
  }

  shouldRetry(now = Date.now()) {
    return this.pending.size > 0 && now >= this.retryAt;
  }

  markFailure(now = Date.now()) {
    this.consecutiveFailures += 1;
    const delay = Math.min(
      INTRADAY_TURNOVER_BUFFER_POLICY.retryMaxMs,
      INTRADAY_TURNOVER_BUFFER_POLICY.retryBaseMs * 2 ** Math.min(this.consecutiveFailures - 1, 20),
    );
    this.retryAt = now + delay;
    return delay;
  }

  markSuccess() {
    this.consecutiveFailures = 0;
    this.retryAt = 0;
  }

  snapshot() {
    return { pendingCount: this.pending.size, retryAt: this.retryAt, consecutiveFailures: this.consecutiveFailures, evictedCount: this.evictedCount };
  }

  private prune(now: number) {
    for (const [key, value] of this.pending) {
      if (now - value.enqueuedAt > INTRADAY_TURNOVER_BUFFER_POLICY.ttlMs) {
        this.pending.delete(key);
        this.evictedCount += 1;
      }
    }
    if (this.pending.size === 0) this.markSuccess();
  }
}

export const intradayTurnoverWriteBuffer = new IntradayTurnoverWriteBuffer();
