/** Bounded producer/consumer queue for candle persistence. */
export class BoundedWriteQueue<T> {
  private readonly pending: Array<{ value: T; resolve: () => void; reject: (error: unknown) => void }> = [];
  private active = 0;
  private closed = false;
  private idleResolvers: Array<() => void> = [];

  constructor(private readonly writer: (value: T) => Promise<void>, private readonly concurrency = 2, private readonly capacity = 64) {}

  enqueue(value: T): Promise<void> {
    if (this.closed) return Promise.reject(new Error("write queue is closed"));
    if (this.pending.length >= this.capacity) return this.drain().then(() => this.enqueue(value));
    return new Promise<void>((resolve, reject) => { this.pending.push({ value, resolve, reject }); this.pump(); });
  }

  async drain() { while (this.pending.length || this.active) await new Promise<void>(resolve => this.idleResolvers.push(resolve)); }

  close() { this.closed = true; return this.drain(); }

  private pump() {
    while (this.active < this.concurrency && this.pending.length) {
      const item = this.pending.shift()!; this.active += 1;
      Promise.resolve().then(() => this.writer(item.value)).then(item.resolve, item.reject).finally(() => { this.active -= 1; this.pump(); if (!this.pending.length && !this.active) { const waiters = this.idleResolvers.splice(0); waiters.forEach(resolve => resolve()); } });
    }
  }
}
