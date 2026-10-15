import { timingSafeEqual } from "node:crypto";

/**
 * Authenticate cron-triggered requests without accepting credentials in URLs.
 * Query-string secrets can be retained in reverse-proxy, browser, and analytics logs.
 */
export function isCronRequestAuthorized(request: Request, configuredSecret = process.env.CRON_SECRET): boolean {
  const expected = configuredSecret?.trim();
  if (!expected) return false;

  const customHeader = request.headers.get("x-cron-secret")?.trim();
  const authorization = request.headers.get("authorization");
  const bearer = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  const supplied = customHeader || bearer;

  if (!supplied) return false;
  const suppliedBytes = Buffer.from(supplied);
  const expectedBytes = Buffer.from(expected);
  return suppliedBytes.length === expectedBytes.length && timingSafeEqual(suppliedBytes, expectedBytes);
}
