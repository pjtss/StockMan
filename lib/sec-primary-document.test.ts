import { describe, expect, it } from "vitest";
import { extractSecPrimaryDocumentUrl, isSecFilingIndexUrl } from "./sec-primary-document";

const indexUrl =
  "https://www.sec.gov/Archives/edgar/data/1730168/000119312526295589/0001193125-26-295589-index.htm";

describe("SEC primary document resolver", () => {
  it("extracts the document whose Type matches the filing form", () => {
    const html = `
      <table class="tableFile" summary="Document Format Files">
        <tr><th>Seq</th><th>Description</th><th>Document</th><th>Type</th><th>Size</th></tr>
        <tr>
          <td scope="row">1</td>
          <td scope="row">CURRENT REPORT</td>
          <td scope="row"><a href="/Archives/edgar/data/1730168/000119312526295589/d84378d8k.htm">d84378d8k.htm</a></td>
          <td scope="row">8-K</td>
          <td scope="row">10000</td>
        </tr>
        <tr>
          <td scope="row">2</td>
          <td scope="row">EX-99.1</td>
          <td scope="row"><a href="exhibit991.htm">exhibit991.htm</a></td>
          <td scope="row">EX-99.1</td>
          <td scope="row">5000</td>
        </tr>
      </table>
    `;

    expect(extractSecPrimaryDocumentUrl(indexUrl, html, "8-K")).toBe(
      "https://www.sec.gov/Archives/edgar/data/1730168/000119312526295589/d84378d8k.htm",
    );
  });

  it("recognizes SEC filing index URLs", () => {
    expect(isSecFilingIndexUrl(indexUrl)).toBe(true);
    expect(isSecFilingIndexUrl(indexUrl.replace("-index.htm", ".htm"))).toBe(false);
  });
});
