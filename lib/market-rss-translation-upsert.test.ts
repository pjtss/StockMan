import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { buildMarketRssLinkUpsertValue, buildMarketRssTranslationUpsertReset } from "./market-rss-translation-upsert";

describe("market RSS translation source refresh invalidation", () => {
  it("repairs previously persisted XML-encoded links on refresh without replacing a valid non-empty link", () => {
    const query = new PgDialect().sqlToQuery(buildMarketRssLinkUpsertValue());

    expect(query.sql).toContain('"link" = \'\'');
    expect(query.sql).toContain('"link" LIKE \'%&amp;%\'');
    expect(query.sql).toContain('"link" LIKE \'%&#%\'');
    expect(query.sql).toContain("THEN excluded.link ELSE \"market_rss_articles\".\"link\" END");
    expect(query.sql).toContain('ELSE "market_rss_articles"."link" END');
  });

  it("does not invalidate title translation for summary, body or raw-payload-only refreshes", () => {
    const dialect = new PgDialect();
    const reset = buildMarketRssTranslationUpsertReset();
    const query = dialect.sqlToQuery(reset.translationStatus).sql;

    expect(query).toContain('"title" IS DISTINCT FROM excluded.title');
    expect(query).not.toContain('"summary" IS DISTINCT FROM excluded.summary');
    expect(query).not.toContain("excluded.content");
    expect(query).not.toContain("excluded.raw_payload");
  });

  it("resets translated title and attempt metadata only when title changes", () => {
    const dialect = new PgDialect();
    const reset = buildMarketRssTranslationUpsertReset();

    for (const field of ["translatedTitle", "translationCandidateTitle", "translatedSummary", "translatedContent", "translationProvider", "translationCharCount", "translationSkippedReason", "translationTranslatedAt", "translationAttemptedAt", "translationStatus", "translationFallback", "translationAttempts", "translationError"] as const) {
      const query = dialect.sqlToQuery(reset[field]);
      expect(query.sql, field).toContain("IS DISTINCT FROM excluded.title");
      expect(query.sql, field).not.toContain("IS DISTINCT FROM excluded.summary");
      expect(query.sql, field).toContain("CASE WHEN");
    }

    expect(dialect.sqlToQuery(reset.translationStatus).sql).toContain("THEN 'PENDING'");
    expect(dialect.sqlToQuery(reset.translationFallback).sql).toContain("THEN FALSE");
    expect(dialect.sqlToQuery(reset.translationAttempts).sql).toContain("THEN 0");
    expect(dialect.sqlToQuery(reset.translationCharCount).sql).toContain("THEN 0");
    expect(Object.keys(reset)).not.toContain("notificationStatus");
    expect(Object.keys(reset)).not.toContain("notificationAttempts");
    expect(Object.keys(reset)).not.toContain("notifiedAt");
  });
});
