import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_ANALYSIS_INBOX_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../..", ".local-rss-analysis-inbox");

export function enqueueCodexAnalysis({ itemId, result, directory = DEFAULT_ANALYSIS_INBOX_DIR }) {
  if (!/^[a-f0-9]{64}$/.test(itemId) || !result || typeof result !== "object" || Array.isArray(result)) throw new Error("Codex 분석 전달 입력값이 올바르지 않습니다.");
  mkdirSync(directory, { recursive: true });
  const path = join(directory, `${itemId}.json`);
  const payload = `${JSON.stringify({ itemId, result })}\n`;
  let descriptor;
  try {
    descriptor = openSync(path, "wx", 0o600);
    writeFileSync(descriptor, payload, "utf8");
    closeSync(descriptor);
    return { queued: true, itemId, inboxPath: path };
  } catch (error) {
    if (descriptor !== undefined) { try { closeSync(descriptor); } catch {} }
    if (error?.code !== "EEXIST") throw error;
    if (readFileSync(path, "utf8") === payload) return { queued: false, alreadyQueued: true, itemId, inboxPath: path };
    throw new Error("같은 RSS item_id의 서로 다른 분석 결과가 이미 전달 대기 중입니다.");
  }
}

export function drainCodexAnalysisInbox({ recordAnalysis, directory = DEFAULT_ANALYSIS_INBOX_DIR, log = () => {} }) {
  if (typeof recordAnalysis !== "function") throw new Error("Codex 분석 전달 처리기가 필요합니다.");
  if (!existsSync(directory)) return { applied: 0, failed: 0, errors: [] };
  let applied = 0;
  const errors = [];
  for (const name of readdirSync(directory).filter((entry) => /^[a-f0-9]{64}\.json$/.test(entry)).sort()) {
    const path = join(directory, name);
    try {
      const payload = JSON.parse(readFileSync(path, "utf8"));
      const itemId = name.slice(0, 64);
      if (payload.itemId !== itemId) throw new Error("전달 파일과 item_id가 일치하지 않습니다.");
      recordAnalysis(itemId, payload.result);
      unlinkSync(path);
      applied += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "알 수 없는 오류";
      errors.push({ file: name, message });
      log(`[CODEX_INBOX] ${name}: ${message}`);
    }
  }
  return { applied, failed: errors.length, errors };
}

export async function waitForCodexAnalysisConsumption({ itemId, directory = DEFAULT_ANALYSIS_INBOX_DIR, timeoutMs = 15_000, intervalMs = 250 }) {
  if (!/^[a-f0-9]{64}$/.test(itemId) || !Number.isSafeInteger(timeoutMs) || timeoutMs < 0 || !Number.isSafeInteger(intervalMs) || intervalMs < 25) throw new Error("Codex 분석 전달 확인 입력값이 올바르지 않습니다.");
  const path = join(directory, `${itemId}.json`);
  const deadline = Date.now() + timeoutMs;
  while (existsSync(path) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, intervalMs));
  return !existsSync(path);
}
