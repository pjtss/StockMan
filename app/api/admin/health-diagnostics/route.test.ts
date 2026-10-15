import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ allowed: false, query: vi.fn(), connect: vi.fn() }));

vi.mock("@/lib/admin-auth", () => ({ requireAdminSession: vi.fn(async () => state.allowed) }));
vi.mock("@/lib/db", () => ({
  getPool: () => ({ connect: state.connect, totalCount: 2, idleCount: 1, waitingCount: 0 }),
}));

import { GET } from "./route";

function setupClient() {
  state.query.mockImplementation(async (text: string) => ({ rows: [], rowCount: 0, command: text }));
  state.connect.mockResolvedValue({ query: state.query, release: vi.fn() });
}

describe("admin health diagnostics API", () => {
  it("requires an admin session before acquiring a database connection", async () => {
    state.allowed = false;
    state.connect.mockClear();
    const response = await GET();
    expect(response.status).toBe(401);
    expect(state.connect).not.toHaveBeenCalled();
  });

  it("runs health SQL probes read-only with statement timeout and exposes only timings", async () => {
    state.allowed = true;
    setupClient();
    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.statementTimeoutMs).toBe(1500);
    expect(body.pool).toEqual({ total: 2, idle: 1, waiting: 0 });
    expect(body.probes.map((item: { name: string }) => item.name)).toContain("automation_latest_by_module");
    expect(JSON.stringify(body)).not.toContain("SELECT");
    expect(state.query).toHaveBeenCalledWith("BEGIN READ ONLY");
    expect(state.query).toHaveBeenCalledWith("ROLLBACK");
  });

  it("reports a timed-out query by error code and continues subsequent read-only probes", async () => {
    state.allowed = true;
    setupClient();
    state.query.mockImplementation(async (text: string) => {
      if (text.startsWith("SELECT DISTINCT ON (module_key) module_key, status, started_at, finished_at, error_message, summary FROM automation_runs ORDER BY")) {
        throw Object.assign(new Error("database details must not leak"), { code: "57014" });
      }
      return { rows: [], rowCount: 0 };
    });

    const response = await GET();
    const body = await response.json();
    const slowProbe = body.probes.find((item: { name: string }) => item.name === "automation_latest_by_module");
    expect(body.ok).toBe(false);
    expect(slowProbe).toMatchObject({ ok: false, errorCode: "57014" });
    expect(body.probes.at(-1).name).toBe("cache_feature_settings");
    expect(JSON.stringify(body)).not.toContain("database details must not leak");
  });
});
