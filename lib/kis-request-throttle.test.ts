import { describe, expect, it } from "vitest";
import { classifyKisFailure } from "@/lib/kis-request-throttle";

describe("KIS failure classification", () => {
  it("classifies rate limit and transient HTTP responses as retryable", () => {
    expect(classifyKisFailure({ response: { status: 429 } })).toBe("RATE_LIMITED");
    expect(classifyKisFailure({ response: { status: 503 } })).toBe("TRANSIENT_HTTP");
  });

  it("distinguishes authentication and permanent errors", () => {
    expect(classifyKisFailure({ response: { status: 401 } })).toBe("AUTH_EXPIRED");
    expect(classifyKisFailure({ response: { status: 400 } })).toBe("PERMANENT");
  });

  it("classifies HTTP 200 business errors from rt_cd", () => {
    expect(classifyKisFailure({ response: { status: 200 }, parsed: { rt_cd: "1", msg_cd: "EGW99999", msg1: "business error" } })).toBe("PERMANENT");
  });

  it("classifies a non-JSON response as a permanent protocol error", () => {
    expect(classifyKisFailure({ response: { status: 200 }, rawText: "<!doctype html>", parsed: null })).toBe("PERMANENT");
  });
});
