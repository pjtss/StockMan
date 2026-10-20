import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { withLocalFileLock } from "./file-lock.mjs";

export const CSV_COLUMNS = ["item_id", "source", "published_at", "observed_at", "title", "summary", "link", "decision", "ticker", "catalyst", "analysis_ko", "evidence", "risks", "confidence", "collection_mode", "status"];
const LEGACY_CSV_COLUMNS = CSV_COLUMNS.filter((column) => column !== "collection_mode");
const MAX_SEEN_ITEMS = 10_000;

export function csvCell(value) {
  let text = String(value ?? "").replace(/[\r\n\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]+/g, " ");
  if (/^[\s]*[=+@\-]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function renderCsv(rows) {
  return `\uFEFF${CSV_COLUMNS.map(csvCell).join(",")}\r\n${rows.map((row) => CSV_COLUMNS.map((key) => csvCell(row[key])).join(",")).join("\r\n")}${rows.length ? "\r\n" : ""}`;
}

export function parseCsvLine(line) {
  const fields = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted && char === '"' && line[i + 1] === '"') { field += '"'; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { fields.push(field); field = ""; }
    else field += char;
  }
  fields.push(field);
  return fields;
}

export function rssItemId(source, item) {
  const identity = String(item.id || item.link || `${item.title}\n${item.publishedAt || ""}`).trim();
  return createHash("sha256").update(`${source}\n${identity}`).digest("hex");
}

function emptyState() { return { version: 1, seen: {}, initializedSources: [] }; }

function readState(path) {
  if (!existsSync(path)) return emptyState();
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    if (parsed?.version !== 1 || !parsed.seen || Array.isArray(parsed.seen) || !Array.isArray(parsed.initializedSources)) throw new Error("invalid state");
    return parsed;
  } catch { throw new Error(`RSS 감시 상태 파일을 읽을 수 없습니다: ${path}`); }
}

function saveState(path, state) {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  writeFileSync(temp, `${JSON.stringify(state)}\n`, { encoding: "utf8", flag: "w" });
  renameSync(temp, path);
}

function readCsvRows(path) {
  if (!existsSync(path)) return [];
  const lines = readFileSync(path, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const headers = parseCsvLine(lines[0]);
  const isLegacy = headers.length === LEGACY_CSV_COLUMNS.length && LEGACY_CSV_COLUMNS.every((key, i) => headers[i] === key);
  const isCurrent = headers.length === CSV_COLUMNS.length && CSV_COLUMNS.every((key, i) => headers[i] === key);
  if (!isLegacy && !isCurrent) throw new Error(`분석 CSV의 형식이 예상과 다릅니다: ${path}`);
  return lines.slice(1).map((line) => {
    const fields = parseCsvLine(line);
    if (fields.length !== headers.length) throw new Error(`분석 CSV 행의 필드 수가 올바르지 않습니다: ${path}`);
    return { ...Object.fromEntries(fields.map((value, i) => [headers[i], value])), collection_mode: isLegacy ? "LIVE" : fields[headers.indexOf("collection_mode")] };
  });
}

function ensureCsv(path) {
  mkdirSync(dirname(path), { recursive: true });
  if (!existsSync(path)) writeFileSync(path, renderCsv([]), { encoding: "utf8", flag: "wx" });
}

function appendRows(path, rows) {
  ensureCsv(path);
  if (!rows.length) return;
  const existingRows = readCsvRows(path);
  const existing = new Set(existingRows.map((row) => row.item_id));
  const unique = rows.filter((row) => !existing.has(row.item_id));
  if (!unique.length) return;
  // Atomic rewrite also migrates the prior 15-column CSV header without mixing row schemas.
  writeRows(path, [...existingRows, ...unique]);
}

function writeRows(path, rows) {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  writeFileSync(temp, renderCsv(rows), { encoding: "utf8", flag: "w" });
  renameSync(temp, path);
}

export function createLocalRssWatchStore({ outputDir, filename = "stockman-rss-codex-analysis.csv" } = {}) {
  if (!outputDir) throw new Error("로컬 RSS 저장소 outputDir가 필요합니다.");
  const csvPath = resolve(outputDir, filename);
  const statePath = resolve(outputDir, ".stockman-rss-codex-state.json");
  const lockPath = resolve(outputDir, ".stockman-rss-codex.lock");

  function ingestFeed(source, items, observedAt) {
    if (typeof source !== "string" || !source || !Array.isArray(items) || !Number.isFinite(Date.parse(observedAt))) throw new Error("피드 저장 입력값이 올바르지 않습니다.");
    return withLocalFileLock(lockPath, () => {
      const state = readState(statePath);
      const wasInitialized = state.initializedSources.includes(source);
      const newRows = [];
      for (const item of items) {
        if (!item || typeof item.title !== "string" || !item.title.trim()) continue;
        const id = rssItemId(source, item);
        if (state.seen[id]) {
          state.seen[id] = observedAt;
          continue;
        }
        state.seen[id] = observedAt;
        if (wasInitialized) newRows.push({
          item_id: id,
          source,
          published_at: item.publishedAt || "",
          observed_at: observedAt,
          title: item.title,
          summary: item.summary || "",
          link: item.link || "",
          decision: "",
          ticker: "",
          catalyst: "",
          analysis_ko: "",
          evidence: "",
          risks: "",
          confidence: "",
          collection_mode: "LIVE",
          status: "PENDING_ANALYSIS",
        });
      }
      state.initializedSources = [...new Set([...state.initializedSources, source])];
      state.seen = Object.fromEntries(Object.entries(state.seen).sort((a, b) => b[1].localeCompare(a[1])).slice(0, MAX_SEEN_ITEMS));
      appendRows(csvPath, newRows);
      saveState(statePath, state);
      return { source, feedItems: items.length, newItems: newRows.length, baseline: !wasInitialized };
    });
  }

  function queueInitialBackfill(source, items, observedAt) {
    if (typeof source !== "string" || !source || !Array.isArray(items) || !Number.isFinite(Date.parse(observedAt))) throw new Error("RSS 초기 backfill 입력값이 올바르지 않습니다.");
    return withLocalFileLock(lockPath, () => {
      const state = readState(statePath);
      const existingRows = readCsvRows(csvPath);
      const recordedIds = new Set(existingRows.map((row) => row.item_id));
      const rows = [];
      let accepted = 0;
      for (const item of items) {
        if (!item || typeof item.title !== "string" || !item.title.trim()) continue;
        const id = rssItemId(source, item);
        state.seen[id] = observedAt;
        accepted += 1;
        if (recordedIds.has(id)) continue;
        recordedIds.add(id);
        rows.push({
          item_id: id,
          source,
          published_at: item.publishedAt || "",
          observed_at: observedAt,
          title: item.title,
          summary: item.summary || "",
          link: item.link || "",
          decision: "",
          ticker: "",
          catalyst: "",
          analysis_ko: "",
          evidence: "",
          risks: "",
          confidence: "",
          collection_mode: "INITIAL_BACKFILL",
          status: "PENDING_ANALYSIS",
        });
      }
      state.initializedSources = [...new Set([...state.initializedSources, source])];
      state.seen = Object.fromEntries(Object.entries(state.seen).sort((a, b) => b[1].localeCompare(a[1])).slice(0, MAX_SEEN_ITEMS));
      if (rows.length) writeRows(csvPath, [...existingRows, ...rows]);
      else ensureCsv(csvPath);
      saveState(statePath, state);
      return { source, feedItems: items.length, acceptedItems: accepted, newItems: rows.length, backfill: true };
    });
  }

  function pending(limit = 20) {
    const max = Number.isSafeInteger(limit) ? Math.min(Math.max(limit, 1), 100) : 20;
    // CSV replacement is atomic; read-only Codex runtimes must not need Downloads write access.
    return readCsvRows(csvPath).filter((row) => row.status === "PENDING_ANALYSIS").slice(0, max);
  }

  function recordAnalysis(itemId, result) {
    if (!/^[a-f0-9]{64}$/.test(itemId)) throw new Error("item_id 형식이 올바르지 않습니다.");
    return withLocalFileLock(lockPath, () => {
      const rows = readCsvRows(csvPath);
      const index = rows.findIndex((row) => row.item_id === itemId);
      if (index < 0) throw new Error("Downloads CSV에 해당 item_id가 없습니다.");
      const fields = ["decision", "ticker", "catalyst", "analysis_ko", "evidence", "risks", "confidence"];
      if (rows[index].status === "ANALYZED") {
        if (fields.every((key) => rows[index][key] === String(result[key] ?? ""))) return { csvPath, itemId, decision: result.decision, alreadyRecorded: true };
        throw new Error("이미 다른 분석 결과가 기록된 RSS 항목입니다.");
      }
      if (rows[index].status !== "PENDING_ANALYSIS") throw new Error("대기 상태 RSS 항목만 분석 결과를 기록할 수 있습니다.");
      rows[index] = { ...rows[index], ...Object.fromEntries(fields.map((key) => [key, result[key] ?? ""])), status: "ANALYZED" };
      writeRows(csvPath, rows);
      return { csvPath, itemId, decision: result.decision };
    });
  }

  return { csvPath, statePath, ingestFeed, queueInitialBackfill, pending, recordAnalysis };
}
