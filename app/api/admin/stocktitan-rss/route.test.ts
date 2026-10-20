import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const state = vi.hoisted(() => ({
  authorized: true,
  rows: [] as Array<Record<string, unknown>>,
  whereCondition: null as unknown,
  updateValues: null as Record<string, unknown> | null,
  updatedRows: [{ id: 1 }] as Array<{ id: number }>,
}));

vi.mock("@/lib/admin-auth", () => ({ requireAdminSession: async () => state.authorized }));
vi.mock("@/lib/db", () => ({
  getDb: () => ({
    update: () => ({
      set: (values: Record<string, unknown>) => {
        state.updateValues = values;
        return {
          where: (condition: unknown) => {
            state.whereCondition = condition;
            return { returning: async () => state.updatedRows };
          },
        };
      },
    }),
    select: () => ({
      from: () => ({
        where: (condition: unknown) => {
          state.whereCondition = condition;
          return { orderBy: async () => state.rows };
        },
      }),
    }),
  }),
}));

import { GET, POST } from "./route";

const manualRetryPayload = {
  id: 7,
  expectedUpdatedAt: "2026-09-25T00:00:00.000Z",
  expectedTitle: "Original headline",
  expectedStatus: "SKIPPED",
  expectedReason: "translation_output_incomplete",
  expectedAttempts: 3,
};

describe("admin StockTitan RSS API", () => {
  it("requires admin authentication for manual translation retry", async () => {
    state.authorized = false;
    const response = await POST(new Request("http://localhost/api/admin/stocktitan-rss", { method: "POST", body: JSON.stringify({ id: 1, expectedUpdatedAt: "2026-09-25T00:00:00.000Z" }) }));

    expect(response.status).toBe(401);
    expect(state.updateValues).toBeNull();
    state.authorized = true;
  });

  it("rejects malformed manual retry requests before touching the database", async () => {
    const response = await POST(new Request("http://localhost/api/admin/stocktitan-rss", { method: "POST", body: JSON.stringify({ id: 0, expectedUpdatedAt: "not-a-date" }) }));

    expect(response.status).toBe(400);
    expect(state.updateValues).toBeNull();
  });

  it("queues one eligible fallback and resets only translation retry state with optimistic concurrency", async () => {
    state.updatedRows = [{ id: 7 }];
    const response = await POST(new Request("http://localhost/api/admin/stocktitan-rss", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(manualRetryPayload),
    }));
    const body = await response.json();
    const query = new PgDialect().sqlToQuery(state.whereCondition as never);

      expect(response.status).toBe(200);
      expect(body).toMatchObject({ ok: true, id: 7, status: "PENDING" });
      expect(body).toMatchObject({ notificationStatusUnchanged: true });
      expect(body.message).toContain("Discord 알림은 재발송하지 않습니다");
      expect(state.updateValues).toMatchObject({ translationStatus: "PENDING", translationFallback: false, translationAttempts: 0, translationAttemptedAt: null, translationCandidateTitle: null });
      expect(state.updateValues).not.toHaveProperty("notificationStatus");
    expect(query.sql).toContain('"updated_at" >=');
    expect(query.sql).toContain('"updated_at" <');
    expect(query.params).toContain("Original headline");
    expect(query.params).toContain("SKIPPED");
    expect(query.sql).toContain('"translation_fallback" =');
    expect(query.sql).toContain('"translation_attempts" >=');
    expect(query.sql).toContain('"notify_eligible" =');
    expect(query.sql).toContain('"is_backlog" =');
    expect(query.sql).toContain('"notification_status" not in');
    expect(query.params).toContain("2026-09-25T00:00:00.001Z");
    expect(query.params).toContain("translation_output_incomplete");
    expect(query.params).toContain(3);
    expect(query.params).not.toContain("monthly_character_limit_reached");
    expect(query.params).not.toContain("provider_daily_quota_exceeded");
    expect(query.params).toContain("PROCESSING");
    expect(query.params).toContain("SENDING");
  });

  it("returns conflict when the article changed or is no longer retryable", async () => {
    state.updatedRows = [];
    const response = await POST(new Request("http://localhost/api/admin/stocktitan-rss", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(manualRetryPayload),
    }));

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "ARTICLE_CHANGED_OR_NOT_RETRYABLE" });
  });

  it.each(["2026-09-31", "2026-02-29", "2026-13-01", "2026-00-10"])("rejects impossible calendar date %s without querying articles", async (date) => {
    state.authorized = true;
    state.rows = [];

    const response = await GET(new Request(`http://localhost/api/admin/stocktitan-rss?date=${date}&source=STOCKTITAN`));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({ ok: false, error: "invalid date" });
  });

  it("accepts a real leap day and returns the requested KST date", async () => {
    state.authorized = true;
    state.rows = [];

    const response = await GET(new Request("http://localhost/api/admin/stocktitan-rss?date=2028-02-29&source=STOCKTITAN"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, date: "2028-02-29", timezone: "Asia/Seoul", count: 0 });
  });

  it("accepts and reports a selected KST start-time filter", async () => {
    state.authorized = true;
    state.rows = [];
    const response = await GET(new Request("http://localhost/api/admin/stocktitan-rss?date=2026-09-25&source=STOCKTITAN&afterTime=15%3A00"));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ date: "2026-09-25", afterTime: "15:00", timezone: "Asia/Seoul" });
    const query = new PgDialect().sqlToQuery(state.whereCondition as never);
    expect(query.sql).toContain('"published_at" >=');
    expect(query.params).toContain("2026-09-25T06:00:00.000Z");
    expect(query.params).toContain("2026-09-25T15:00:00.000Z");
  });

  it("redacts credentials from legacy stored translation errors before returning rows", async () => {
    state.authorized = true;
    state.rows = [{
      id: 1,
      source: "STOCKTITAN",
      title: "Revenue rises",
      publishedAt: new Date("2026-09-25T01:00:00.000Z"),
      priority: 100,
      notifyEligible: true,
      translationError: "fetch https://translation.googleapis.com/v2?key=AIzaSyDUMMY012345678901234567890123456789&password=query-password failed; token=legacy-secret Authorization: Bearer bearer-secret",
    }];

    const response = await GET(new Request("http://localhost/api/admin/stocktitan-rss?date=2026-09-25&source=STOCKTITAN"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.articles[0].translationError).toContain("[redacted]");
    expect(body.articles[0].translationError).not.toContain("AIzaSyDUMMY");
    expect(body.articles[0].translationError).not.toContain("legacy-secret");
    expect(body.articles[0].translationError).not.toContain("query-password");
    expect(body.articles[0].translationError).not.toContain("bearer-secret");
    expect(body.articles[0].translationError).toContain("Authorization: [redacted]");
  });

  it("returns the complete selected day without a hidden page-size cap", async () => {
    state.authorized = true;
    state.rows = Array.from({ length: 1_205 }, (_, index) => ({
      id: index + 1,
      source: "STOCKTITAN",
      title: `RSS headline ${index + 1}`,
      publishedAt: new Date("2026-09-25T01:00:00.000Z"),
      priority: 100,
      notifyEligible: true,
    }));

    const response = await GET(new Request("http://localhost/api/admin/stocktitan-rss?date=2026-09-25&source=STOCKTITAN"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.count).toBe(1_205);
    expect(body.articles).toHaveLength(1_205);
    expect(body.articles[1_204].id).toBe(1_205);
  });
});
