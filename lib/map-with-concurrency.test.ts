import { describe, expect, it } from "vitest";
import { mapWithConcurrency } from "./map-with-concurrency";

describe("mapWithConcurrency", () => {
  it("bounds active work and returns values in input order", async () => {
    let active = 0;
    let maximumActive = 0;
    const result = await mapWithConcurrency([30, 10, 20, 5], 2, async (delay, index) => {
      active++;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, delay));
      active--;
      return index;
    });

    expect(result).toEqual([0, 1, 2, 3]);
    expect(maximumActive).toBe(2);
  });

  it("stops assigning work after failure and waits for in-flight side effects before rejecting", async () => {
    let finishSecond!: () => void;
    let secondStarted!: () => void;
    let firstFailed!: () => void;
    const secondHasStarted = new Promise<void>((resolve) => { secondStarted = resolve; });
    const firstHasFailed = new Promise<void>((resolve) => { firstFailed = resolve; });
    const second = new Promise<void>((resolve) => { finishSecond = resolve; });
    const assigned: number[] = [];
    let settled = false;

    const pending = mapWithConcurrency([0, 1, 2, 3], 2, async (value) => {
      assigned.push(value);
      if (value === 0) {
        await secondHasStarted;
        firstFailed();
        throw new Error("write failed");
      }
      if (value === 1) {
        secondStarted();
        await second;
      }
      return value;
    }).finally(() => { settled = true; });

    await firstHasFailed;
    expect(settled).toBe(false);
    finishSecond();
    await expect(pending).rejects.toThrow("write failed");
    expect(assigned).toEqual([0, 1]);
    expect(settled).toBe(true);
  });

  it("rejects invalid concurrency rather than silently running unbounded", async () => {
    await expect(mapWithConcurrency([1], 0, async (value) => value)).rejects.toThrow(RangeError);
    await expect(mapWithConcurrency([1], 1.5, async (value) => value)).rejects.toThrow(RangeError);
  });
});
