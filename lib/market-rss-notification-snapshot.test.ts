import { describe, expect, it } from "vitest";
import { createMarketRssNotificationSnapshot, isMarketRssNotificationSnapshot, matchesMarketRssNotificationSnapshot } from "./market-rss-notification-snapshot";

const row = {
  source: "NASDAQ",
  title: "Revenue rises",
  summary: "Raised guidance",
  translatedTitle: "매출 증가",
  translationStatus: "TRANSLATED",
  translationFallback: false,
  translationSkippedReason: null,
  translationError: null,
  detectedTicker: "TEST",
  link: "https://example.com/story",
  publishedAt: new Date("2026-09-25T12:00:00.123Z"),
};

describe("market RSS notification snapshot", () => {
  it("serializes timestamps canonically and recognizes its persisted JSON form", () => {
    const snapshot = createMarketRssNotificationSnapshot(row);

    expect(snapshot.publishedAt).toBe("2026-09-25T12:00:00.123Z");
    expect(isMarketRssNotificationSnapshot(JSON.parse(JSON.stringify(snapshot)))).toBe(true);
  });

  it("matches unchanged rows independent of Date versus ISO-string representation", () => {
    const snapshot = createMarketRssNotificationSnapshot(row);

    expect(matchesMarketRssNotificationSnapshot(snapshot, { ...row, publishedAt: snapshot.publishedAt })).toBe(true);
  });

  it.each([
    ["source", "SEC_EDGAR"],
    ["title", "Updated title"],
    ["summary", "Updated context"],
    ["translatedTitle", "다른 번역"],
    ["translationStatus", "SKIPPED"],
    ["translationFallback", true],
    ["translationSkippedReason", "provider_daily_quota_exceeded"],
    ["translationError", "provider error"],
    ["detectedTicker", "OTHER"],
    ["link", "https://example.com/updated"],
    ["publishedAt", new Date("2026-09-25T12:01:00.000Z")],
  ] as const)("detects changed payload field %s", (field, value) => {
    const snapshot = createMarketRssNotificationSnapshot(row);

    expect(matchesMarketRssNotificationSnapshot(snapshot, { ...row, [field]: value })).toBe(false);
  });

  it("rejects incomplete or incorrectly typed stored snapshots", () => {
    const snapshot = createMarketRssNotificationSnapshot(row);

    expect(isMarketRssNotificationSnapshot({ ...snapshot, translationFallback: "false" })).toBe(false);
    const { translationError: _removed, ...incomplete } = snapshot;
    expect(isMarketRssNotificationSnapshot(incomplete)).toBe(false);
  });
});
