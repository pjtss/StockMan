import { describe, expect, it } from "vitest";
import { isCronRequestAuthorized } from "@/lib/cron-auth";

describe("isCronRequestAuthorized", () => {
  const secret = " cron-secret ";

  it("accepts a trimmed x-cron-secret header", () => {
    const request = new Request("https://example.test/api/cron", { headers: { "x-cron-secret": " cron-secret " } });
    expect(isCronRequestAuthorized(request, secret)).toBe(true);
  });

  it("accepts case-insensitive Bearer with repeated whitespace", () => {
    const request = new Request("https://example.test/api/cron", { headers: { authorization: "bEaReR\t  cron-secret  " } });
    expect(isCronRequestAuthorized(request, secret)).toBe(true);
  });

  it("does not let an empty custom header mask a valid Bearer header", () => {
    const request = new Request("https://example.test/api/cron", { headers: { "x-cron-secret": "  ", authorization: "Bearer cron-secret" } });
    expect(isCronRequestAuthorized(request, secret)).toBe(true);
  });

  it("fails closed when the configured secret is missing or wrong", () => {
    const request = new Request("https://example.test/api/cron", { headers: { "x-cron-secret": "cron-secret" } });
    expect(isCronRequestAuthorized(request, " ")).toBe(false);
    expect(isCronRequestAuthorized(request, "different-secret")).toBe(false);
  });

  it("never accepts a credential from the URL query string", () => {
    const request = new Request("https://example.test/api/cron?secret=cron-secret");
    expect(isCronRequestAuthorized(request, secret)).toBe(false);
  });
});
