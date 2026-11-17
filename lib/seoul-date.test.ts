import { describe, expect, it } from "vitest";
import { formatSeoulDateTime, getSeoulDateKey } from "./seoul-date";

describe("Seoul date and time formatting", () => {
  it("formats timestamps in Asia/Seoul independently of the runtime timezone", () => {
    const instant = "2026-11-03T15:00:00.000Z";

    expect(getSeoulDateKey(new Date(instant))).toBe("2026-11-04");
    expect(formatSeoulDateTime(instant)).toContain("00:00:00");
  });

  it("preserves an invalid timestamp string for visibility", () => {
    expect(formatSeoulDateTime("unknown-time")).toBe("unknown-time");
  });
});
