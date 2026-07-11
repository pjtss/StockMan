import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SecItem } from "./types";

const mocks = vi.hoisted(() => ({
  buildSecAiPayloadFromDocument: vi.fn(),
  buildSecDiscordResult: vi.fn(),
  evaluateSecFilingWithAi: vi.fn(),
  fetchSecPrimaryDocument: vi.fn(),
  sendSecResultToDiscord: vi.fn(),
}));

vi.mock("./sec-ai-evaluator", () => ({
  evaluateSecFilingWithAi: mocks.evaluateSecFilingWithAi,
}));
vi.mock("./sec-ai-payload", () => ({
  buildSecAiPayloadFromDocument: mocks.buildSecAiPayloadFromDocument,
}));
vi.mock("./sec-discord-result", () => ({
  buildSecDiscordResult: mocks.buildSecDiscordResult,
}));
vi.mock("./discord-sec", () => ({
  sendSecResultToDiscord: mocks.sendSecResultToDiscord,
}));
vi.mock("./sec-primary-document", () => ({
  fetchSecPrimaryDocument: mocks.fetchSecPrimaryDocument,
}));

import { processSecFiling } from "./sec-filing-processor";

const item: SecItem = {
  source: "SEC",
  accession: "0001193125-26-295589",
  company: "Broadcom Inc.",
  formType: "8-K",
  sentiment: "호재가능",
  publishedAt: "2026-07-10T00:00:00.000Z",
  title: "Broadcom 8-K",
  summary: "Material event",
  link: "https://www.sec.gov/Archives/edgar/data/1730168/000119312526295589/d84378d8k.htm",
};

describe("processSecFiling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchSecPrimaryDocument.mockResolvedValue({
      indexUrl: item.link,
      urlInfo: {
        canonicalUrl: item.link,
        originalUrl: item.link,
        cik: "1730168",
        accessionNumber: item.accession,
        accessionCompact: "000119312526295589",
        documentFile: "d84378d8k.htm",
        directoryUrl: "https://www.sec.gov/Archives/edgar/data/1730168/000119312526295589/",
      },
      document: { url: item.link, html: "<html />", text: "" },
    });
    mocks.buildSecAiPayloadFromDocument.mockReturnValue({ metadata: {}, events: [] });
    mocks.evaluateSecFilingWithAi.mockResolvedValue({
      skipped: false,
      model: "test-model",
      evaluation: { level: "bullish" },
      rawText: "{}",
    });
    mocks.buildSecDiscordResult.mockReturnValue({});
    mocks.sendSecResultToDiscord.mockResolvedValue({ ok: true, status: 200, responseText: "{}" });
  });

  it("runs the source, parser, AI, and Discord modules in one filing workflow", async () => {
    const result = await processSecFiling(item);

    expect(mocks.fetchSecPrimaryDocument).toHaveBeenCalledWith(item);
    expect(mocks.buildSecAiPayloadFromDocument).toHaveBeenCalled();
    expect(mocks.evaluateSecFilingWithAi).toHaveBeenCalled();
    expect(mocks.buildSecDiscordResult).toHaveBeenCalled();
    expect(mocks.sendSecResultToDiscord).toHaveBeenCalled();
    expect(result.externalId).toBe(item.accession);
  });

  it("stops before external calls when the SEC URL is invalid", async () => {
    mocks.fetchSecPrimaryDocument.mockRejectedValue(new Error("SEC filing URL is invalid"));

    await expect(processSecFiling(item)).rejects.toThrow("SEC filing URL is invalid");
    expect(mocks.evaluateSecFilingWithAi).not.toHaveBeenCalled();
    expect(mocks.sendSecResultToDiscord).not.toHaveBeenCalled();
  });
});
