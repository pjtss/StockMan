import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  claimDartAutomation: vi.fn(),
  fetchOpenDartToday: vi.fn(),
  isDartDiscordConfigured: vi.fn(),
  markDartAutomationDelivered: vi.fn(),
  markDartAutomationFailed: vi.fn(),
  sendDartAlertToDiscord: vi.fn(),
  sendPushAlerts: vi.fn(),
}));

vi.mock("./dart-opendart-client", () => ({ fetchOpenDartToday: mocks.fetchOpenDartToday }));
vi.mock("./dart-automation-store", () => ({
  claimDartAutomation: mocks.claimDartAutomation,
  markDartAutomationDelivered: mocks.markDartAutomationDelivered,
  markDartAutomationFailed: mocks.markDartAutomationFailed,
}));
vi.mock("./push", () => ({ sendPushAlerts: mocks.sendPushAlerts }));
vi.mock("./discord-dart", () => ({
  isDartDiscordConfigured: mocks.isDartDiscordConfigured,
  sendDartAlertToDiscord: mocks.sendDartAlertToDiscord,
}));

import { runDartAutomation } from "./dart-automation";

describe("runDartAutomation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isDartDiscordConfigured.mockReturnValue(true);
    mocks.fetchOpenDartToday.mockResolvedValue({
      dateKey: "20260711",
      fetchedAt: "2026-07-11T03:00:00.000Z",
      pagesFetched: 4,
      totalCount: 350,
      rows: [
        {
          rcept_no: "20260711000001",
          rcept_dt: "20260711",
          corp_name: "테스트 주식회사",
          report_nm: "단일판매ㆍ공급계약체결",
        },
      ],
    });
    mocks.sendPushAlerts.mockResolvedValue(undefined);
    mocks.sendDartAlertToDiscord.mockResolvedValue({ ok: true, status: 200, responseText: "{}" });
    mocks.markDartAutomationDelivered.mockResolvedValue(undefined);
  });

  it("delivers only receipt numbers claimed by the persistent store", async () => {
    mocks.claimDartAutomation.mockResolvedValue(new Set(["20260711000001"]));

    const result = await runDartAutomation();

    expect(mocks.sendPushAlerts).toHaveBeenCalledTimes(1);
    expect(mocks.sendDartAlertToDiscord).toHaveBeenCalledTimes(1);
    expect(mocks.markDartAutomationDelivered).toHaveBeenCalledWith("20260711000001");
    expect(result).toMatchObject({
      pagesFetched: 4,
      totalDisclosures: 350,
      candidates: 1,
      claimed: 1,
      delivered: 1,
      failed: 0,
    });
  });

  it("does not send the initial baseline returned as unclaimed", async () => {
    mocks.claimDartAutomation.mockResolvedValue(new Set());

    const result = await runDartAutomation();

    expect(mocks.sendPushAlerts).not.toHaveBeenCalled();
    expect(mocks.sendDartAlertToDiscord).not.toHaveBeenCalled();
    expect(result.claimed).toBe(0);
  });

  it("skips collection before claiming when the dedicated webhook is missing", async () => {
    mocks.isDartDiscordConfigured.mockReturnValue(false);

    const result = await runDartAutomation();

    expect(mocks.fetchOpenDartToday).not.toHaveBeenCalled();
    expect(mocks.claimDartAutomation).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      skipped: true,
      reason: "DART_DISCORD_WEBHOOK_URL is not configured",
    });
  });
});
