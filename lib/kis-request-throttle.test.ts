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
});
