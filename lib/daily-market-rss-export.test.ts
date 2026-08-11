import { describe, expect, it } from "vitest";
import { getSecSubmissionGrade } from "./daily-market-rss-export";

describe("daily market RSS export grades", () => {
  it("maps SEC positive scores to the shared grade scale", () => {
    expect(getSecSubmissionGrade(75)).toBe("high");
    expect(getSecSubmissionGrade(65)).toBe("medium");
    expect(getSecSubmissionGrade(45)).toBe("low");
  });

  it("excludes neutral and negative SEC classifications", () => {
    expect(getSecSubmissionGrade(0)).toBe("excluded");
    expect(getSecSubmissionGrade(-75)).toBe("excluded");
    expect(getSecSubmissionGrade(null)).toBe("excluded");
  });
});
