import { describe, expect, it } from "vitest";
import { getRequestIdentity, maskIp, summarizeUserAgent } from "./request-identity";

describe("request identity edge cases", () => {
  it("uses forwarded IP and falls back when headers are missing", () => {
    const request = new Request("http://localhost", { headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1", "user-agent": "Mozilla Chrome Windows" } });
    expect(getRequestIdentity(request).ip).toBe("203.0.113.9");
    expect(getRequestIdentity(new Request("http://localhost")).ip).toBe("unknown");
  });
  it("masks IPv4 and IPv6 without throwing on malformed values", () => {
    expect(maskIp("203.0.113.9")).toBe("203.0.*.*");
    expect(maskIp("2001:db8:85a3:1:2:3:4:5")).toBe("2001:db8:85a3:*:*:*:*:*");
    expect(maskIp("unknown")).toBe("*.*.*.*");
  });
  it("summarizes common user agents", () => {
    expect(summarizeUserAgent("Mozilla Chrome Windows")).toBe("Chrome / Windows");
    expect(summarizeUserAgent("Mozilla Safari iPhone")).toBe("Safari / iOS");
    expect(summarizeUserAgent("")).toBe("Browser / Other");
  });
});
