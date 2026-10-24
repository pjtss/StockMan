import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { buildMarketRssNotificationClaimCondition, buildMarketRssNotificationRateWindowCondition, buildMarketRssNotificationTranslationGate } from "./market-rss-notification-translation-gate";

describe("market RSS notification translation gate", () => {
  it("allows only validated Korean translations and titles already in Korean", () => {
    const query = new PgDialect().sqlToQuery(buildMarketRssNotificationTranslationGate());
    expect(query.sql).toContain('"market_rss_articles"."translation_status" =');
    expect(query.sql).toContain('"market_rss_articles"."translation_skipped_reason" =');
    expect(query.params).toContain("TRANSLATED");
    expect(query.params).toContain("already_in_target_language");
  });

  it("claims only the unchanged source and translation snapshot used to build the payload", () => {
    const query = new PgDialect().sqlToQuery(buildMarketRssNotificationClaimCondition({
      id: 42,
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
      publishedAt: new Date("2026-09-25T12:00:00.000Z"),
    }));

    expect(query.sql).toContain('"market_rss_articles"."notification_status" = $2');
    for (const column of ["source", "title", "summary", "translated_title", "translation_status", "translation_fallback", "detected_ticker", "link", "published_at"]) {
      expect(query.sql).toContain(`"market_rss_articles"."${column}" =`);
    }
    expect(query.sql).toContain('"market_rss_articles"."translation_skipped_reason" is null');
    expect(query.sql).toContain('"market_rss_articles"."translation_error" is null');
    expect(query.params).toEqual([
      42,
      "PENDING",
      "NASDAQ",
      "Revenue rises",
      "Raised guidance",
      "매출 증가",
      "TRANSLATED",
      false,
      "TEST",
      "https://example.com/story",
      "2026-09-25T12:00:00.000Z",
    ]);
  });

  it("counts both delivered and in-flight sends in the rolling per-minute limit", () => {
    const cutoff = new Date("2026-09-25T12:00:00.000Z");
    const query = new PgDialect().sqlToQuery(buildMarketRssNotificationRateWindowCondition(cutoff)!);
    expect(query.sql).toContain('"market_rss_articles"."notification_status" in');
    expect(query.sql).toContain('"market_rss_articles"."notified_at" >=');
    expect(query.params).toContain("SENT");
    expect(query.params).toContain("SENDING");
    expect(query.params.map((value) => value instanceof Date ? value.toISOString() : String(value))).toContain(cutoff.toISOString());
  });
});
