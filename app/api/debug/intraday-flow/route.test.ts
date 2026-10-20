import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => vi.fn(async () => true));
const query = vi.hoisted(() => vi.fn(async () => ({ rows: [] as any[] })));

vi.mock("@/lib/admin-auth", () => ({ requireAdminSession: auth }));
vi.mock("@/lib/db", () => ({ getPool: () => ({ query }) }));

import { GET } from "./route";

describe("intraday flow debug API", () => {
  beforeEach(() => { query.mockReset(); auth.mockReset().mockResolvedValue(true); });

  it("requires an administrator session before reading diagnostics", async () => {
    auth.mockResolvedValueOnce(false);
    const response = await GET();
    expect(response.status).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });

  it("reports a missing turnover table separately from in-memory retry state", async () => {
    query
      .mockResolvedValueOnce({ rows: [{ ticks: 0 }] } as any)
      .mockResolvedValueOnce({ rows: [{ transitions: 0 }] } as any)
      .mockResolvedValueOnce({ rows: [{ exists: false }] } as any);

    const body = await (await GET()).json();
    expect(body.persistence).toMatchObject({ table: "intraday_turnover_observations", status: "TABLE_MISSING", pendingCount: 0 });
    expect(body.flow.queue.turnoverPersistence).toMatchObject({ pendingCount: 0, consecutiveFailures: 0, evictedCount: 0 });
    expect(query).toHaveBeenCalledTimes(3);
  });

  it("reports healthy persistence only when recent observation rows exist", async () => {
    const lastObservedAt = new Date("2026-09-25T05:30:00.000Z");
    query
      .mockResolvedValueOnce({ rows: [{ ticks: 1 }] } as any)
      .mockResolvedValueOnce({ rows: [{ transitions: 1 }] } as any)
      .mockResolvedValueOnce({ rows: [{ exists: true }] } as any)
      .mockResolvedValueOnce({ rows: [{ rows: 12, lastObservedAt }] } as any);

    const body = await (await GET()).json();
    expect(body.persistence).toMatchObject({ status: "READY", recentRows: 12, lastObservedAt: lastObservedAt.toISOString() });
  });

  it("does not report READY when the table exists but no observation was saved recently", async () => {
    query
      .mockResolvedValueOnce({ rows: [{ ticks: 0 }] } as any)
      .mockResolvedValueOnce({ rows: [{ transitions: 0 }] } as any)
      .mockResolvedValueOnce({ rows: [{ exists: true }] } as any)
      .mockResolvedValueOnce({ rows: [{ rows: 0, lastObservedAt: null }] } as any);

    const body = await (await GET()).json();
    expect(body.persistence).toMatchObject({ status: "NO_RECENT_DATA", recentRows: 0, lastObservedAt: null });
  });

  it("reports DB diagnostics unavailable without leaking raw database errors", async () => {
    query.mockRejectedValue(new Error("postgres://secret connection detail"));

    const body = await (await GET()).json();
    expect(body.persistence.status).toBe("DATABASE_UNAVAILABLE");
    expect(JSON.stringify(body)).not.toContain("secret connection detail");
  });
});
