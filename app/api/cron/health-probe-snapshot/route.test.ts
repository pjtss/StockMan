import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ query: vi.fn(), clientQuery: vi.fn(), release: vi.fn() }));
vi.mock("@/lib/db", () => ({ getPool: () => ({ query: state.query, connect: async () => ({ query: state.clientQuery, release: state.release }) }) }));

import { POST } from "./route";

describe("health probe snapshot cron", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "cron-test";
    state.query.mockReset();
    state.clientQuery.mockReset();
    state.release.mockReset();
  });

  it("rejects requests without the cron secret", async () => {
    const response = await POST(new Request("http://localhost/api/cron/health-probe-snapshot", { method: "POST" }));
    expect(response.status).toBe(401);
    expect(state.query).not.toHaveBeenCalled();
  });

  it("accepts a Bearer authorization header", async () => {
    state.query.mockResolvedValue({ rows: [], rowCount: 0 });
    state.clientQuery.mockImplementation(async (input: string) => {
      if (input === "SELECT to_regclass('public.health_probe_history') IS NOT NULL AS ready") return { rows: [{ ready: true }], rowCount: 1 };
      return { rows: [{ value: 1 }], rowCount: 1 };
    });

    const response = await POST(new Request("http://localhost/api/cron/health-probe-snapshot", {
      method: "POST",
      headers: { authorization: "bEaReR   cron-test" },
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, recorded: 3 });
  });

  it("records measured probes and returns degraded when a probe fails", async () => {
    state.query.mockResolvedValue({ rows: [], rowCount: 0 });
    state.clientQuery.mockImplementation(async (input: string) => {
      if (input === "SELECT to_regclass('public.health_probe_history') IS NOT NULL AS ready") return { rows: [{ ready: true }], rowCount: 1 };
      if (input.includes("automation_runs")) throw Object.assign(new Error("statement timeout"), { code: "57014" });
      return { rows: [{ value: 1 }], rowCount: 1 };
    });

    const response = await POST(new Request("http://localhost/api/cron/health-probe-snapshot", { method: "POST", headers: { "x-cron-secret": "cron-test", "x-request-id": "test-run" } }));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ ok: false, recorded: 3, probes: [{ name: "db_connection", ok: true }, { name: "automation_history_latest", ok: false, errorCode: "57014" }, { name: "health_schema", ok: true }] });
    expect(state.query).toHaveBeenCalledTimes(2);
    expect(state.query.mock.calls[0][0]).toContain("INSERT INTO health_probe_history");
    expect(state.query.mock.calls[1][0]).toContain("14 days");
    expect(state.release).toHaveBeenCalledTimes(3);
  });
});
