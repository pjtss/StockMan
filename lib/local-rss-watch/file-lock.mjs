import { closeSync, existsSync, mkdirSync, openSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

const STALE_LOCK_MS = 120_000;
const RETRY_MS = 25;

function processIsAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; }
  catch (error) { return error?.code === "EPERM"; }
}

function reclaimStaleLock(lockPath) {
  try {
    const before = statSync(lockPath);
    if (Date.now() - before.mtimeMs < STALE_LOCK_MS) return false;
    let owner;
    try { owner = JSON.parse(readFileSync(lockPath, "utf8")); } catch { owner = null; }
    if (processIsAlive(owner?.pid)) return false;

    const current = statSync(lockPath);
    if (current.mtimeMs !== before.mtimeMs || current.size !== before.size) return false;
    unlinkSync(lockPath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return true;
    throw error;
  }
}

/** Synchronous cross-process lock for short local state/CSV transactions. */
export function withLocalFileLock(lockPath, task, { timeoutMs = 10_000 } = {}) {
  if (typeof lockPath !== "string" || !lockPath || typeof task !== "function") throw new Error("로컬 파일 잠금 입력값이 올바르지 않습니다.");
  mkdirSync(dirname(lockPath), { recursive: true });
  const token = randomUUID();
  const startedAt = Date.now();
  let descriptor;

  while (descriptor === undefined) {
    try {
      descriptor = openSync(lockPath, "wx", 0o600);
      writeFileSync(descriptor, JSON.stringify({ pid: process.pid, token, acquiredAt: new Date().toISOString() }), "utf8");
      closeSync(descriptor);
      descriptor = null;
    } catch (error) {
      if (descriptor !== undefined && descriptor !== null) {
        try { closeSync(descriptor); } catch {}
        descriptor = undefined;
      }
      if (error?.code !== "EEXIST") throw error;
      if (reclaimStaleLock(lockPath)) continue;
      if (Date.now() - startedAt >= timeoutMs) throw new Error(`RSS 로컬 파일 잠금 대기 시간이 초과되었습니다: ${lockPath}`);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, RETRY_MS);
    }
  }

  try {
    return task();
  } finally {
    try {
      const owner = JSON.parse(readFileSync(lockPath, "utf8"));
      if (owner.token === token) unlinkSync(lockPath);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
}
