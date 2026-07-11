import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SecItem } from "./types";

const mocks = vi.hoisted(() => ({
  claimSecAutomation: vi.fn(),
  isSecAiEvaluationConfigured: vi.fn(),
  isSecDiscordConfigured: vi.fn(),
  markSecAutomationDelivered: vi.fn(),
  markSecAutomationFailed: vi.fn(),
  processSecFiling: vi.fn(),
  syncSecAlerts: vi.fn(),
}));

vi.mock("./sec-ai-evaluator", () => ({
  isSecAiEvaluationConfigured: mocks.isSecAiEvaluationConfigured,
}));
vi.mock("./sec-alerts", () => ({ syncSecAlerts: mocks.syncSecAlerts }));
vi.mock("./sec-automation-store", () => ({
  claimSecAutomation: mocks.claimSecAutomation,
  markSecAutomationDelivered: mocks.markSecAutomationDelivered,
  markSecAutomationFailed: mocks.markSecAutomationFailed,
}));
vi.mock("./discord-sec", () => ({
  isSecDiscordConfigured: mocks.isSecDiscordConfigured,
}));
vi.mock("./sec-filing-processor", () => ({
  processSecFiling: mocks.processSecFiling,
}));

import { runSecAutomation } from "./sec-automation";

const item: SecItem = {
  source: "SEC",
  accession: "0001193125-26-295589",
  company: "Broadcom Inc.",
  formType: "8-K",
  sentiment: "호재가능",
  publishedAt: new Date().toISOString(),
  title: "Broadcom 8-K",
  summary: "Material event",
  link: "https://www.sec.gov/Archives/edgar/data/1730168/000119312526295589/d84378d8k.htm",
};

describe("runSecAutomation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isSecAiEvaluationConfigured.mockReturnValue(true);
    mocks.isSecDiscordConfigured.mockReturnValue(true);
    mocks.syncSecAlerts.mockResolvedValue({
      source: "SEC",
      fetchedAt: new Date().toISOString(),
      items: [item],
      newAlerts: [],
    });
    mocks.claimSecAutomation.mockResolvedValue(true);
    mocks.processSecFiling.mockResolvedValue({ externalId: item.accession });
  });

  it("parses, evaluates, sends, and records a claimed SEC filing", async () => {
    const result = await runSecAutomation();

    expect(mocks.claimSecAutomation).toHaveBeenCalledWith(item.accession);
    expect(mocks.processSecFiling).toHaveBeenCalledWith(item);
    expect(mocks.markSecAutomationDelivered).toHaveBeenCalledWith(item.accession);
    expect(mocks.markSecAutomationFailed).not.toHaveBeenCalled();
    expect(result.automation).toMatchObject({
      skipped: false,
      claimed: 1,
      delivered: 1,
      failed: 0,
    });
  });

  it("does not start processing when AI or Discord configuration is missing", async () => {
    mocks.isSecDiscordConfigured.mockReturnValue(false);

    const result = await runSecAutomation();

    expect(mocks.claimSecAutomation).not.toHaveBeenCalled();
    expect(mocks.processSecFiling).not.toHaveBeenCalled();
    expect(result.automation).toMatchObject({
      skipped: true,
      claimed: 0,
      delivered: 0,
    });
  });

  it("records a failed filing so the scheduler can retry it", async () => {
    mocks.processSecFiling.mockRejectedValue(new Error("OpenAI unavailable"));

    const result = await runSecAutomation();

    expect(mocks.markSecAutomationFailed).toHaveBeenCalledWith(
      item.accession,
      "OpenAI unavailable",
    );
    expect(mocks.markSecAutomationDelivered).not.toHaveBeenCalled();
    expect(result.automation).toMatchObject({ delivered: 0, failed: 1 });
  });
});
