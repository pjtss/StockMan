import { describe, expect, it } from "vitest";
import { buildSecAiPayloadFromDocument } from "./sec-ai-payload";
import { parseSecFilingUrl } from "./sec-filing-url";

const broadcomUrl =
  "https://www.sec.gov/Archives/edgar/data/1730168/000119312526295589/d84378d8k.htm?utm_source=chatgpt.com";

const broadcomHtml = `
  <html>
    <body>
      <ix:nonNumeric name="dei:DocumentType">8-K</ix:nonNumeric>
      <ix:nonNumeric name="dei:EntityRegistrantName">Broadcom Inc.</ix:nonNumeric>
      <ix:nonNumeric name="dei:TradingSymbol">AVGO</ix:nonNumeric>
      <ix:nonNumeric name="dei:DocumentPeriodEndDate">July 6, 2026</ix:nonNumeric>
      <ix:nonNumeric name="dei:EntityCentralIndexKey">1730168</ix:nonNumeric>
      <p>Item 8.01 Other Events.</p>
      <p>
        Broadcom Inc. ("Broadcom") and Apple Inc. ("Apple") have agreed to expand their long-standing
        technology collaboration through 2031 by entering into new multi-year long-term agreements for
        Broadcom to develop and supply a range of custom ASIC silicon products for use in multiple
        generations of Apple products.
      </p>
      <p>Cautionary Note Regarding Forward-Looking Statements</p>
      <p>This sentence should not drive the AI payload.</p>
      <p>Item 9.01 Financial Statements and Exhibits.</p>
      <p>Exhibit 99.1 Press release.</p>
      <p>SIGNATURE</p>
    </body>
  </html>
`;

function buildBroadcomPayload() {
  const urlInfo = parseSecFilingUrl(broadcomUrl);
  return buildSecAiPayloadFromDocument(urlInfo.canonicalUrl, broadcomHtml, undefined, urlInfo);
}

describe("SEC filing payload", () => {
  it("normalizes the Broadcom SEC URL and builds the 8-K event payload", () => {
    const urlInfo = parseSecFilingUrl(broadcomUrl);
    const payload = buildBroadcomPayload();

    expect(urlInfo.canonicalUrl).toBe(
      "https://www.sec.gov/Archives/edgar/data/1730168/000119312526295589/d84378d8k.htm",
    );
    expect(urlInfo.cik).toBe("1730168");
    expect(urlInfo.accessionNumber).toBe("0001193125-26-295589");
    expect(urlInfo.accessionCompact).toBe("000119312526295589");
    expect(urlInfo.documentFile).toBe("d84378d8k.htm");
    expect(payload.formType).toBe("8-K");
    expect(payload.company).toBe("Broadcom Inc.");
    expect(payload.ticker).toBe("AVGO");
    expect(payload.reportDate).toBe("July 6, 2026");
    expect(payload.events).toEqual([
      expect.objectContaining({
        type: "OTHER_EVENT",
        item: "8.01",
        title: "Other Events",
      }),
    ]);
    expect(payload.text).not.toContain("Item 8.01 Other Events");
    expect(payload.text).toContain("Broadcom Inc.");
    expect(payload.text).not.toContain("Financial Statements and Exhibits");
    expect(payload.text).not.toContain("SIGNATURE");
    expect(payload.promptText).toContain("Company: Broadcom Inc.");
    expect(payload.promptText).toContain("Ticker: AVGO");
    expect(payload.promptText).toContain("Form: 8-K");
    expect(payload.promptText).toContain("Report date: July 6, 2026");
    expect(payload.promptText).toContain("Accession: 0001193125-26-295589");
    expect(payload.promptText).toContain("Material filing events:");
    expect(payload.promptText).toContain("Event 1");
    expect(payload.promptText).toContain("Type: OTHER_EVENT");
    expect(payload.promptText).toContain("Item: 8.01");
    expect(payload.promptText).toContain("Title: Other Events");
    expect(payload.promptText).toContain("Text:");
    expect(payload.promptText.match(/Other Events/g)).toHaveLength(1);
  });

});
