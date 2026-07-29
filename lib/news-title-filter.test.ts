import { describe, expect, it } from "vitest";
import { scoreNewsTitle } from "./news-title-filter";

describe("news title catalyst filter", () => {
  it("matches normalized positive variants", () => { expect(scoreNewsTitle("FDA가 승인한 신약").eligible).toBe(true); });
  it("rejects dilution headlines", () => { expect(scoreNewsTitle("Company announces ATM offering").eligible).toBe(false); });
  it("does not treat neutral headlines as catalysts", () => { expect(scoreNewsTitle("Company announces conference participation").eligible).toBe(false); });
});
