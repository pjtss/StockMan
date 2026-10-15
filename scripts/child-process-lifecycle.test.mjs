import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { stopChildProcess } from "./child-process-lifecycle.mjs";

class FakeProcess extends EventEmitter {
  exitCode = null;
  signalCode = null;
  pid = 1234;
  killCalls = [];

  kill(signal) {
    this.killCalls.push(signal);
    this.signalCode = signal ?? "SIGTERM";
    this.exitCode = 1;
    queueMicrotask(() => this.emit("exit", this.exitCode, this.signalCode));
    return true;
  }
}

function exitingTaskkill(order, { delayMs = 5, onTreeKill } = {}) {
  return vi.fn(() => {
    const killer = new FakeProcess();
    killer.pid = 5678;
    killer.kill = vi.fn();
    setTimeout(() => {
      order.push("taskkill-exit");
      onTreeKill?.();
      killer.exitCode = 0;
      killer.emit("exit", 0, null);
    }, delayMs);
    return killer;
  });
}

describe("child process lifecycle", () => {
  it("waits for Windows taskkill and confirms the target process exits", async () => {
    const order = [];
    const child = new FakeProcess();
    const spawnProcess = exitingTaskkill(order, {
      onTreeKill: () => {
        child.exitCode = 0;
        child.emit("exit", 0, null);
      },
    });

    await stopChildProcess(child, { platform: "win32", spawnProcess, taskkillTimeoutMs: 100, gracefulTimeoutMs: 100, forcedTimeoutMs: 100 });

    expect(spawnProcess).toHaveBeenCalledWith("taskkill", ["/pid", "1234", "/t", "/f"], expect.any(Object));
    expect(order).toEqual(["taskkill-exit"]);
    expect(child.killCalls).toEqual([]);
    expect(child.exitCode).toBe(0);
  });

  it("falls back to direct termination when taskkill cannot start", async () => {
    const child = new FakeProcess();
    const spawnProcess = vi.fn(() => { throw new Error("taskkill unavailable"); });

    await stopChildProcess(child, { platform: "win32", spawnProcess, gracefulTimeoutMs: 100, forcedTimeoutMs: 100 });

    expect(child.killCalls).toEqual([undefined]);
  });

  it("kills a stuck taskkill helper and falls back to the target process", async () => {
    const child = new FakeProcess();
    const spawnProcess = vi.fn(() => {
      const killer = new FakeProcess();
      killer.kill = vi.fn(() => {
        killer.signalCode = "SIGTERM";
        killer.exitCode = 1;
        queueMicrotask(() => killer.emit("exit", 1, "SIGTERM"));
        return true;
      });
      return killer;
    });

    await stopChildProcess(child, { platform: "win32", spawnProcess, taskkillTimeoutMs: 5, gracefulTimeoutMs: 100, forcedTimeoutMs: 100 });

    expect(spawnProcess).toHaveBeenCalledTimes(1);
    expect(child.killCalls).toEqual([undefined]);
  });

  it("escalates from SIGTERM to SIGKILL when a POSIX child ignores termination", async () => {
    const child = new FakeProcess();
    child.kill = vi.fn((signal) => {
      child.killCalls.push(signal);
      if (signal === "SIGKILL") {
        child.signalCode = signal;
        queueMicrotask(() => child.emit("exit", null, signal));
      }
      return true;
    });

    await stopChildProcess(child, { platform: "linux", gracefulTimeoutMs: 5, forcedTimeoutMs: 100 });

    expect(child.killCalls).toEqual(["SIGTERM", "SIGKILL"]);
  });
});
