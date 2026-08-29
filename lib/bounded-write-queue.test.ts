import { describe, expect, it } from "vitest";
import { BoundedWriteQueue } from "./bounded-write-queue";

describe("BoundedWriteQueue", () => {
  it("limits concurrent writers and drains all queued work", async () => {
    let active = 0;
    let peak = 0;
    const written: number[] = [];
    const queue = new BoundedWriteQueue<number>(async value => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise(resolve => setTimeout(resolve, 5));
      written.push(value);
      active -= 1;
    }, 2, 3);

    await Promise.all([1, 2, 3, 4, 5].map(value => queue.enqueue(value)));
    await queue.drain();

    expect(peak).toBeLessThanOrEqual(2);
    expect(written).toHaveLength(5);
    expect(new Set(written)).toEqual(new Set([1, 2, 3, 4, 5]));
  });

  it("propagates writer failures while allowing the queue to become idle", async () => {
    const queue = new BoundedWriteQueue<number>(async value => {
      if (value === 2) throw new Error("write failed");
    }, 1, 4);

    const results = await Promise.allSettled([queue.enqueue(1), queue.enqueue(2), queue.enqueue(3)]);
    await queue.drain();

    expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
    await expect(queue.close()).resolves.toBeUndefined();
  });

  it("applies backpressure when the queue reaches capacity", async () => {
    let release!: () => void;
    let calls = 0;
    const queue = new BoundedWriteQueue<number>(async () => { calls += 1; if (calls === 1) await new Promise<void>(resolve => { release = resolve; }); }, 1, 1);
    const first = queue.enqueue(1);
    const second = queue.enqueue(2);
    let thirdDone = false;
    const third = queue.enqueue(3).then(() => { thirdDone = true; });

    await new Promise(resolve => setTimeout(resolve, 10));
    expect(thirdDone).toBe(false);
    release();
    await Promise.all([first, second, third]);
    expect(thirdDone).toBe(true);
  });

  it("rejects new work after close", async () => {
    const queue = new BoundedWriteQueue<number>(async () => undefined);
    await queue.close();
    await expect(queue.enqueue(1)).rejects.toThrow("write queue is closed");
  });

  it("handles synchronous writer throws and continues processing later work", async () => {
    const written: number[] = [];
    const queue = new BoundedWriteQueue<number>(value => {
      if (value === 1) throw new Error("sync failure");
      written.push(value);
      return Promise.resolve();
    }, 1, 4);

    const results = await Promise.allSettled([queue.enqueue(1), queue.enqueue(2)]);
    await queue.drain();
    expect(results[0].status).toBe("rejected");
    expect(results[1].status).toBe("fulfilled");
    expect(written).toEqual([2]);
  });

  it("supports draining an empty queue", async () => {
    const queue = new BoundedWriteQueue<number>(async () => undefined);
    await expect(queue.drain()).resolves.toBeUndefined();
  });
});
