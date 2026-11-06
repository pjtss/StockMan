import { describe, expect, it } from "vitest";
import { classifyRssTimestamp } from "./disclosure-timestamp-precision";

describe("classifyRssTimestamp", () => {
  it("accepts an instant only when raw source has time and timezone", () => {
    expect(classifyRssTimestamp(JSON.stringify({ pubDate: "2026-11-06T12:34:56-05:00" }))).toEqual({ precision: "INSTANT", date: null });
  });

  it("keeps date-only values out of event time windows", () => {
    expect(classifyRssTimestamp(JSON.stringify({ published: "2026-11-06" }))).toEqual({ precision: "DATE", date: "2026-11-06" });
  });

  it.each([null, "{}", "not-json", JSON.stringify({ updated: "2026-11-06T12:34:56" })])("does not infer source precision from %s", (raw) => {
    expect(classifyRssTimestamp(raw)).toEqual({ precision: "UNKNOWN", date: null });
  });
});
