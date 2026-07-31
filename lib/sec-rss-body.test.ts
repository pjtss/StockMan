import { describe, expect, it } from "vitest";
import { inferSecFormType } from "./sec-rss-body";

describe("SEC RSS body resolution", () => {
  it("infers 8-K and ownership form types", () => {
    expect(inferSecFormType("8-K - ACME INC (0001234567)")).toBe("8-K");
    expect(inferSecFormType("SCHEDULE 13D/A - Holder (0001234567)")).toBe("SCHEDULE 13D/A");
  });
});
