import { describe, expect, it } from "vitest";
import { extractSecCik } from "./sec-company-ticker";

describe("SEC company ticker mapping", () => {
  it("extracts the zero-padded CIK from an RSS title", () => {
    expect(extractSecCik("8-K - Example, Inc. (0001506983) (Filer)")).toBe("0001506983");
  });
});
