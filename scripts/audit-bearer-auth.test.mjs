import { describe, expect, it } from "vitest";
import { findDoubleEscapedBearerParsers, findNonCentralizedCronSecretRoutes } from "./audit-bearer-auth.mjs";

describe("Bearer parser source audit", () => {
  it("flags a regex that matches a literal backslash-s instead of whitespace", () => {
    expect(findDoubleEscapedBearerParsers([
      { file: "bad/route.ts", content: String.raw`replace(/^Bearer\\s+/i, "")` },
    ])).toEqual(["bad/route.ts"]);
  });

  it("allows the whitespace regex used by valid Bearer parsers", () => {
    expect(findDoubleEscapedBearerParsers([
      { file: "good/route.ts", content: String.raw`replace(/^Bearer\s+/i, "")` },
    ])).toEqual([]);
  });

  it("requires CRON_SECRET routes to use the shared authenticator", () => {
    expect(findNonCentralizedCronSecretRoutes([
      { file: "cron/new/route.ts", content: 'if (request.headers.get("x-cron-secret") === process.env.CRON_SECRET) {}' },
      { file: "cron/shared/route.ts", content: 'if (isCronRequestAuthorized(request)) {}' },
    ])).toEqual(["cron/new/route.ts"]);
  });

  it("allows routes that only report whether CRON_SECRET is configured", () => {
    expect(findNonCentralizedCronSecretRoutes([
      { file: "admin/market-debug/route.ts", content: 'cronSecretConfigured: Boolean(process.env.CRON_SECRET)' },
    ])).toEqual([]);
  });
});
