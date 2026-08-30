import { describe, expect, it, vi } from "vitest";
import { createDebugContext, childDebugContext } from "@/lib/debug-context";
import { writeDebugLog } from "@/lib/debug-logger";

describe("debug context and logger", () => {
  it("creates stable request context and child context", () => {
    const parent = createDebugContext({ feature: "test", market: "KR" });
    const child = childDebugContext(parent, { code: "005930", timeframe: "D", attempt: 2 });
    expect(parent.requestId).toBe(child.requestId);
    expect(child.code).toBe("005930");
    expect(child.startedAt).toBe(parent.startedAt);
  });

  it("redacts secrets in structured logs", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    writeDebugLog("INFO", "test_event", createDebugContext({ feature: "test" }), { appSecret: "secret", value: "Bearer abc123" });
    expect(String(spy.mock.calls[0]?.[0])).toContain("[REDACTED]");
    expect(String(spy.mock.calls[0]?.[0])).not.toContain("secret");
    expect(String(spy.mock.calls[0]?.[0])).not.toContain("abc123");
    spy.mockRestore();
  });
});
