import { describe, expect, it } from "vitest";
import { translationHash } from "./translation-cache";

describe("translation cache", () => {
  it("creates a stable UTF-8 content hash", () => {
    expect(translationHash("Title with spaces ")).toHaveLength(64);
    expect(translationHash("제목")).toBe(translationHash("제목"));
    expect(translationHash("제목")).not.toBe(translationHash("제목 "));
  });
});
