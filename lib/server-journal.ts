import { execFile } from "node:child_process";

export const SERVER_JOURNAL_UNITS = [
  "stockman.service",
  "stockman-cron.service",
  "stockman-rss.service",
  "stockman-fundamentals.service",
  "nginx.service",
  "nginx-access",
] as const;

const MAX_UNITS = SERVER_JOURNAL_UNITS.length;
const MAX_LINES_PER_UNIT = 100;
const MAX_MESSAGE_LENGTH = 1_500;
const MAX_BUFFER_BYTES = 2_097_152;
const JOURNAL_TIMEOUT_MS = 10_000;
const PRIORITY_NAMES = ["EMERGENCY", "ALERT", "CRITICAL", "ERROR", "WARNING", "NOTICE", "INFO", "DEBUG"] as const;

export type ServerJournalOptions = { units: string[]; minutes: number; limit: number };
export type ServerJournalEntry = { timestamp: string | null; priority: string; message: string; messageTruncated: boolean };
export type ServerJournalUnitResult = {
  unit: string;
  available: boolean;
  errorCode?: "JOURNALCTL_UNAVAILABLE" | "JOURNAL_ACCESS_DENIED" | "JOURNAL_READ_TIMEOUT" | "JOURNAL_READ_FAILED" | "JOURNAL_OUTPUT_INVALID" | "JOURNAL_UNIT_NOT_ALLOWED";
  entries: ServerJournalEntry[];
  returnedCount: number;
  truncated: boolean;
};

export function parseServerJournalOptions(params: URLSearchParams): ServerJournalOptions | null {
  const rawUnits = params.getAll("logUnit");
  if (rawUnits.length > MAX_UNITS) return null;
  const units = rawUnits.length === 0 ? [...SERVER_JOURNAL_UNITS] : [...new Set(rawUnits)];
  if (units.length > MAX_UNITS || units.some((unit) => !SERVER_JOURNAL_UNITS.includes(unit as typeof SERVER_JOURNAL_UNITS[number]))) return null;

  const parseBoundedInteger = (name: string, fallback: number, minimum: number, maximum: number) => {
    const raw = params.get(name);
    if (raw == null) return fallback;
    if (!/^\d+$/.test(raw)) return null;
    const value = Number(raw);
    return Number.isSafeInteger(value) && value >= minimum && value <= maximum ? value : null;
  };
  const minutes = parseBoundedInteger("logMinutes", 60, 1, 1_440);
  const limit = parseBoundedInteger("logLimit", 50, 1, MAX_LINES_PER_UNIT);
  if (minutes == null || limit == null) return null;
  return { units, minutes, limit };
}

/** Remove common credential forms before a system journal line reaches an API response. */
export function redactServerLogMessage(value: string) {
  return value
    .replace(/\bBearer\s+[^\s,;]+/gi, "Bearer [REDACTED]")
    .replace(/https?:\/\/(?:discord(?:app)?\.com)\/api\/webhooks\/[^\s<>"']+/gi, "[WEBHOOK_URL_REDACTED]")
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gi, "[PRIVATE_KEY_REDACTED]")
    .replace(/\b([A-Z0-9_-]*(?:SECRET|TOKEN|PASSWORD|PASSWD|API[_-]?KEY|APPKEY|APPSECRET|WEBHOOK|DATABASE_URL|PRIVATE[_-]?KEY|CREDENTIAL)[A-Z0-9_-]*)\b(\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,;]+)/gi, "$1$2[REDACTED]")
    .replace(/\b(postgres(?:ql)?:\/\/[^:/\s@]+:)[^@/\s]+@/gi, "$1[REDACTED]@")
    .replace(/\b(https?:\/\/[^\s?#]+\?[^\s#]*(?:token|secret|key|password)=)[^&#\s]*/gi, "$1[REDACTED]")
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}\b/g, "[JWT_REDACTED]")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .slice(0, MAX_MESSAGE_LENGTH);
}

function normalizePriority(value: unknown) {
  const numeric = typeof value === "string" && /^\d$/.test(value) ? Number(value) : typeof value === "number" ? value : -1;
  return Number.isInteger(numeric) && numeric >= 0 && numeric < PRIORITY_NAMES.length ? PRIORITY_NAMES[numeric] : "UNKNOWN";
}

function normalizeTimestamp(value: unknown) {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  const milliseconds = Math.floor(Number(value) / 1_000);
  if (!Number.isSafeInteger(milliseconds)) return null;
  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function parseServerJournalOutput(output: string): { entries: ServerJournalEntry[]; invalidLineCount: number } {
  const entries: ServerJournalEntry[] = [];
  let invalidLineCount = 0;
  for (const line of output.split(/\r?\n/)) {
    if (!line) continue;
    try {
      const record = JSON.parse(line) as Record<string, unknown>;
      const messageUnavailable = record.MESSAGE == null;
      const rawMessage = typeof record.MESSAGE === "string"
        ? record.MESSAGE
        : Array.isArray(record.MESSAGE) && record.MESSAGE.every((part) => typeof part === "number")
          ? "[binary journal message omitted]"
          : Array.isArray(record.MESSAGE) && record.MESSAGE.every((part) => typeof part === "string")
            ? record.MESSAGE.join(" | ")
          : "";
      const message = redactServerLogMessage(rawMessage);
      entries.push({
        timestamp: normalizeTimestamp(record.__REALTIME_TIMESTAMP),
        priority: normalizePriority(record.PRIORITY),
        message,
        messageTruncated: messageUnavailable || rawMessage.length > MAX_MESSAGE_LENGTH || message.length === MAX_MESSAGE_LENGTH,
      });
    } catch {
      invalidLineCount += 1;
    }
  }
  return { entries, invalidLineCount };
}

function readJournalUnit(unit: string, minutes: number, limit: number): Promise<ServerJournalUnitResult> {
  if (!SERVER_JOURNAL_UNITS.includes(unit as typeof SERVER_JOURNAL_UNITS[number])) {
    return Promise.resolve({ unit: "unknown", available: false, errorCode: "JOURNAL_UNIT_NOT_ALLOWED", entries: [], returnedCount: 0, truncated: false });
  }
  const since = new Date(Date.now() - minutes * 60_000).toISOString();
  const args = buildJournalArgs(unit, since, limit);
  return new Promise((resolve) => {
    execFile("journalctl", args, { encoding: "utf8", timeout: JOURNAL_TIMEOUT_MS, maxBuffer: MAX_BUFFER_BYTES, windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        const errorCode = classifyJournalError(error, stderr);
        resolve({ unit, available: false, errorCode, entries: [], returnedCount: 0, truncated: false });
        return;
      }
      const parsed = parseServerJournalOutput(stdout);
      const sinceMs = Date.parse(since);
      const entriesInWindow = parsed.entries.filter((entry) => {
        if (!entry.timestamp) return false;
        const timestampMs = Date.parse(entry.timestamp);
        return Number.isFinite(timestampMs) && timestampMs >= sinceMs && timestampMs <= Date.now();
      });
      if (parsed.invalidLineCount > 0) {
        const entries = entriesInWindow.slice(0, limit).reverse();
        resolve({ unit, available: false, errorCode: "JOURNAL_OUTPUT_INVALID", entries, returnedCount: entries.length, truncated: entries.length >= limit });
        return;
      }
      const entries = entriesInWindow.slice(0, limit).reverse();
      resolve({ unit, available: true, entries, returnedCount: entries.length, truncated: entries.length >= limit });
    });
  });
}

export function buildJournalArgs(unit: string, since: string, limit: number) {
  const sourceFilter = unit === "nginx-access" ? "--identifier=stockman_nginx_access" : `--unit=${unit}`;
  const scanLimit = Math.min(MAX_LINES_PER_UNIT, limit);
  return ["--no-pager", "--quiet", "--output=json", "--utc", "--boot", "--reverse", `--lines=${scanLimit}`, sourceFilter];
}

export function classifyJournalError(error: unknown, stderr: string | Buffer | undefined): NonNullable<ServerJournalUnitResult["errorCode"]> {
  const record: { code?: string; message?: string; killed?: boolean } = error && typeof error === "object" ? error as { code?: string; message?: string; killed?: boolean } : {};
  const code = record.code;
  const diagnostic = `${stderr ?? ""} ${record.message ?? ""}`.toLowerCase();
  return code === "ENOENT"
    ? "JOURNALCTL_UNAVAILABLE"
    : code === "ETIMEDOUT" || record.killed
      ? "JOURNAL_READ_TIMEOUT"
      : /permission denied|not authorized|access denied|operation not permitted/.test(diagnostic)
        ? "JOURNAL_ACCESS_DENIED"
        : "JOURNAL_READ_FAILED";
}

export async function readServerJournal(options: ServerJournalOptions) {
  const since = new Date(Date.now() - options.minutes * 60_000);
  const units = await Promise.all(options.units.map(async (unit) => {
    try {
      return await readJournalUnit(unit, options.minutes, options.limit);
    } catch {
      return { unit, available: false, errorCode: "JOURNAL_READ_FAILED" as const, entries: [], returnedCount: 0, truncated: false };
    }
  }));
  return {
    source: "systemd-journal" as const,
    since: since.toISOString(),
    checkedAt: new Date().toISOString(),
    limitPerUnit: options.limit,
    credentialPatternsRedacted: true,
    units,
  };
}
