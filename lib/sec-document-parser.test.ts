import { describe, expect, it } from "vitest";
import { extractSecItemSections, prepareSecDocument } from "./sec-document-parser";

describe("SEC document item section parser", () => {
  it("parses colon-delimited 8-K item headings from real filing text", () => {
    const text = [
      "FORM 8-K",
      "Item 1.01: Entry into a Material Definitive Agreement",
      "The issuer entered into a material agreement.",
      "Item 9.01: Financial Statements and Exhibits",
      "The exhibits are attached.",
    ].join("\n");

    const sections = extractSecItemSections(text);

    expect(sections.map((section) => section.item)).toEqual(["1.01", "9.01"]);
    expect(sections[0].text).toContain("material agreement");
    expect(sections[1].text).toContain("exhibits");
  });

  it("keeps metadata and sections together for prepared documents", () => {
    const prepared = prepareSecDocument(
      "<html><body><ix:nonNumeric name=\"dei:DocumentType\">8-K</ix:nonNumeric><p>Item 2.01: Completion of Acquisition</p><p>Assets were acquired.</p></body></html>",
      { cik: "1234567", accessionNumber: "0001234567-26-000001", documentFile: "form8-k.htm", canonicalUrl: "https://www.sec.gov/Archives/edgar/data/1234567/form8-k.htm" },
    );

    expect(prepared.metadata.documentType).toBe("8-K");
    expect(prepared.sections).toHaveLength(1);
    expect(prepared.aiText).toContain("Assets were acquired");
  });
});
