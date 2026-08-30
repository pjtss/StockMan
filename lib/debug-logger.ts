import type { DebugContext } from "@/lib/debug-context";

export type DebugLevel = "DEBUG" | "INFO" | "WARN" | "ERROR" | "FATAL";

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (typeof value === "string") return value.replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, "$1[REDACTED]").replace(/(appkey|appsecret|access[_-]?token|password)=([^&\s]+)/gi, "$1=[REDACTED]");
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => {
    if (/app.?key|app.?secret|access.?token|authorization|password|webhook/i.test(key)) return [key, "[REDACTED]"];
    return [key, redact(item)];
  }));
}

export function writeDebugLog(level: DebugLevel, event: string, context: DebugContext, details: Record<string, unknown> = {}) {
  const payload = redact({ level, event, ...context, ...details, loggedAt: new Date().toISOString() });
  const line = JSON.stringify(payload);
  if (level === "ERROR" || level === "FATAL") console.error(line);
  else if (level === "WARN") console.warn(line);
  else console.info(line);
  return payload;
}
