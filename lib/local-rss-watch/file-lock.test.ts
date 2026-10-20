import { mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { withLocalFileLock } from "./file-lock.mjs";

const directories: string[] = [];
function makeLockPath() {
  const directory = mkdtempSync(join(tmpdir(), "stockman-rss-lock-"));
  directories.push(directory);
  return join(directory, "state.lock");
}
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });

describe("local RSS cross-process file lock", () => {
  it("releases the lock after successful and failed transactions", () => {
    const path = makeLockPath();
    expect(withLocalFileLock(path, () => "ok")).toBe("ok");
    expect(() => readFileSync(path, "utf8")).toThrow();
    expect(() => withLocalFileLock(path, () => { throw new Error("transaction failed"); })).toThrow("transaction failed");
    expect(() => readFileSync(path, "utf8")).toThrow();
  });

  it("does not steal a fresh lock owned by a live process", () => {
    const path = makeLockPath();
    writeFileSync(path, JSON.stringify({ pid: process.pid, token: "owner" }), "utf8");
    expect(() => withLocalFileLock(path, () => "should not run", { timeoutMs: 60 })).toThrow("대기 시간이 초과");
    expect(JSON.parse(readFileSync(path, "utf8")).token).toBe("owner");
  });

  it("reclaims an old lock whose owner process no longer exists", () => {
    const path = makeLockPath();
    writeFileSync(path, JSON.stringify({ pid: 2_000_000_000, token: "dead" }), "utf8");
    const old = new Date(Date.now() - 180_000);
    utimesSync(path, old, old);
    expect(withLocalFileLock(path, () => "recovered")).toBe("recovered");
    expect(() => readFileSync(path, "utf8")).toThrow();
  });
});
