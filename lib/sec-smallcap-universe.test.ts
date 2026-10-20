import { describe, expect, it } from "vitest";
import { SEC_SMALLCAP_MAX_USD } from "./sec-smallcap-universe";

describe("SEC small-cap universe policy", () => {
  it("uses the 100 million USD inclusive ceiling", () => {
    expect(SEC_SMALLCAP_MAX_USD).toBe(100_000_000);
  });
});
