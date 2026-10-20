import { describe, expect, it } from "vitest";
import { getMarketRssNotificationStatusDisplay } from "./market-rss-notification-status";

describe("market RSS notification status labels", () => {
  it("explains uncertain delivery without encouraging a duplicate resend", () => {
    expect(getMarketRssNotificationStatusDisplay("UNCERTAIN")).toEqual({
      label: "전송 여부 확인 필요",
      tone: "translationWarning",
      description: "Discord가 메시지를 받았을 수 있어 자동 재전송하지 않았습니다. Discord 채널에서 먼저 확인하세요.",
    });
  });

  it("localizes active and terminal notification states", () => {
    expect(getMarketRssNotificationStatusDisplay("SENDING").label).toBe("Discord 전송 중");
    expect(getMarketRssNotificationStatusDisplay("SENT").label).toBe("Discord 전송 완료");
    expect(getMarketRssNotificationStatusDisplay("FAILED").label).toBe("알림 실패");
    expect(getMarketRssNotificationStatusDisplay("SKIPPED").label).toBe("알림 제외");
  });
});
