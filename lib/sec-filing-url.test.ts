import { describe, expect, it } from "vitest";
import { secFilingUrl } from "./sec-edgar-repository";

describe("SEC filing URL", () => {
  it("falls back to the accession index when primaryDocument is absent", () => {
    expect(secFilingUrl("0000123456", "0000123456-26-000001", "")).toBe("https://www.sec.gov/Archives/edgar/data/123456/000012345626000001/0000123456-26-000001-index.html");
  });
});
