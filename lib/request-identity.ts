import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";

export function getClientIp(request: Request | NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
}

export function getRequestIdentity(request: Request | NextRequest) {
  const ip = getClientIp(request);
  const userAgent = request.headers.get("user-agent") || "unknown";
  const salt = process.env.REQUEST_IDENTITY_SALT || "stockman-request-identity";
  const userKey = createHash("sha256").update(`${ip}:${userAgent}:${salt}`).digest("hex").slice(0, 12);
  return { ip, userAgent, userKey };
}

export function maskIp(ip: string) {
  if (ip.includes(":")) return `${ip.split(":").slice(0, 3).join(":")}:*:*:*:*:*`;
  const parts = ip.split(".");
  return parts.length === 4 ? `${parts[0]}.${parts[1]}.*.*` : "*.*.*.*";
}

export function summarizeUserAgent(userAgent: string) {
  const browser = /Edg/i.test(userAgent) ? "Edge" : /Chrome/i.test(userAgent) ? "Chrome" : /Safari/i.test(userAgent) ? "Safari" : /Firefox/i.test(userAgent) ? "Firefox" : "Browser";
  const platform = /Windows/i.test(userAgent) ? "Windows" : /Android/i.test(userAgent) ? "Android" : /iPhone|iPad/i.test(userAgent) ? "iOS" : /Mac OS/i.test(userAgent) ? "macOS" : "Other";
  return `${browser} / ${platform}`;
}
