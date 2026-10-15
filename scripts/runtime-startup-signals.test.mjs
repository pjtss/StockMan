import { describe, expect, it } from "vitest";
import { createRuntimeStartupSignalTracker } from "./runtime-startup-signals.mjs";

describe("runtime startup signal tracker", () => {
  it("detects Next readiness split across output chunks and records its observation time", () => {
    const tracker = createRuntimeStartupSignalTracker(1_000);
    expect(tracker.accept(Buffer.from("✓ Rea"), 1_200).nextReadyObservedMs).toBeNull();
    const state = tracker.accept(Buffer.from("dy in 219ms"), 1_540);
    expect(state.nextReadyObservedMs).toBe(540);
    expect(state.startupErrorSeen).toBe(false);
  });

  it("retains only allowlisted startup errors and deduplicates codes across chunks", () => {
    const tracker = createRuntimeStartupSignalTracker(10);
    tracker.accept("Error: lis");
    tracker.accept("ten EADDRIN");
    const state = tracker.accept("USE EADDRINUSE");
    expect(state.startupErrorSeen).toBe(true);
    expect(state.errorCodes).toEqual(["EADDRINUSE"]);
    expect(JSON.stringify(state)).not.toContain("listen");
  });
});
