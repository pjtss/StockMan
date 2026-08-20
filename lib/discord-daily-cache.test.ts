import { describe, expect, it } from "vitest";
import { getDailyCacheCommand, splitDailyCacheCommand } from "./discord-daily-cache";

describe("Discord daily detection cache commands", () => {
  it("maps the four requested commands to cache keys", () => {
    expect(getDailyCacheCommand("kr-bollinger-cache")?.key).toBe("daily-bollinger:KR:D:LOWER_OR_BELOW");
    expect(getDailyCacheCommand("us-bollinger-cache")?.key).toBe("daily-bollinger:US:D:LOWER_OR_BELOW");
    expect(getDailyCacheCommand("kr-bollinger-middle-lower-cache")?.key).toBe("daily-bollinger:KR:D:MIDDLE_TO_LOWER");
    expect(getDailyCacheCommand("us-bollinger-middle-lower-cache")?.key).toBe("daily-bollinger:US:D:MIDDLE_TO_LOWER");
    expect(getDailyCacheCommand("kr-golden-cross-cache")?.key).toBe("daily-golden-cross:KR:D");
    expect(getDailyCacheCommand("us-golden-cross-cache")?.key).toBe("daily-golden-cross:US:D");
  });

  it("keeps the response compact and reports omitted records", () => {
    const definition = getDailyCacheCommand("kr-bollinger-cache")!;
    const chunks = splitDailyCacheCommand({ ...definition, cacheKey: definition.key, payload: { updatedAt: "2026-08-20T00:00:00Z", scannedCount: 300, qualifiedCount: 300, qualified: Array.from({ length: 300 }, (_, i) => ({ market: "KRX", code: String(i).padStart(6, "0"), name: "종목" })) } });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 1900)).toBe(true);
    expect(chunks.join("\n")).toContain("KRX 000299");
  });
});
