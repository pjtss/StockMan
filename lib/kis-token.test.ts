import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => {
  type Row = { access_token: string; issued_at: Date; expires_at: Date };
  let row: Row | null = null;
  let lockedRow: Row | null | undefined;
  let failPoolRead = false;

  function selectResult(selected: Row | null) {
    return { rowCount: selected ? 1 : 0, rows: selected ? [selected] : [] };
  }

  const client = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      if (sql.includes("SELECT access_token")) {
        return selectResult(lockedRow === undefined ? row : lockedRow);
      }
      if (sql.includes("INSERT INTO kis_tokens")) {
        row = {
          access_token: String(params[0]),
          issued_at: params[1] as Date,
          expires_at: params[2] as Date,
        };
        return { rowCount: 1, rows: [] };
      }
      if (sql.includes("DELETE FROM kis_tokens")) {
        row = null;
        return { rowCount: 1, rows: [] };
      }
      return { rowCount: 0, rows: [] };
    }),
    release: vi.fn(),
  };

  const pool = {
    query: vi.fn(async (sql: string) => {
      if (failPoolRead) throw new Error("DB unavailable");
      if (sql.includes("SELECT access_token")) return selectResult(row);
      return { rowCount: 0, rows: [] };
    }),
    connect: vi.fn(async () => client),
  };

  return {
    client,
    pool,
    get row() {
      return row;
    },
    setRow(value: Row | null) {
      row = value;
    },
    setLockedRow(value: Row | null | undefined) {
      lockedRow = value;
    },
    setFailPoolRead(value: boolean) {
      failPoolRead = value;
    },
    reset() {
      row = null;
      lockedRow = undefined;
      failPoolRead = false;
      client.query.mockClear();
      client.release.mockClear();
      pool.query.mockClear();
      pool.connect.mockClear();
    },
  };
});

vi.mock("./db", () => ({ getPool: () => database.pool }));

const originalEnv = process.env;

beforeEach(() => {
  database.reset();
  process.env = {
    ...originalEnv,
    KIS_APPKEY: "test-app-key",
    KIS_APPSECRET: "test-app-secret",
  };
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-11T03:00:00.000Z"));
  vi.resetModules();
});

afterEach(() => {
  process.env = originalEnv;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("KIS token lifecycle", () => {
  it("reuses a DB token that has more than one hour remaining", async () => {
    database.setRow({
      access_token: "stored-token",
      issued_at: new Date("2026-07-10T03:00:00.000Z"),
      expires_at: new Date("2026-07-11T05:00:00.000Z"),
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { getAccessToken } = await import("./kis-token");
    const token = await getAccessToken();

    expect(token).toBe("stored-token");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps a same-day token until expiry even inside the one-hour window", async () => {
    database.setRow({
      access_token: "same-day-token",
      issued_at: new Date("2026-07-11T00:00:00.000Z"),
      expires_at: new Date("2026-07-11T03:01:00.000Z"),
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { getAccessToken } = await import("./kis-token");

    expect(await getAccessToken()).toBe("same-day-token");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reuses a previous-day token while the official expiry is still in the future", async () => {
    database.setRow({
      access_token: "previous-day-token",
      issued_at: new Date("2026-07-10T03:00:00.000Z"),
      expires_at: new Date("2026-07-11T03:30:00.000Z"),
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { getAccessToken } = await import("./kis-token");
    expect(await getAccessToken()).toBe("previous-day-token");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("issues once after the official expiry and persists the official expiry", async () => {
    database.setRow({
      access_token: "expiring-token",
      issued_at: new Date("2026-07-10T02:30:00.000Z"),
      expires_at: new Date("2026-07-11T02:59:00.000Z"),
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: "new-token",
        access_token_token_expired: "2026-07-12 12:00:00",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { getAccessToken } = await import("./kis-token");
    const tokens = await Promise.all([getAccessToken(), getAccessToken(), getAccessToken()]);

    expect(tokens).toEqual(["new-token", "new-token", "new-token"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(database.row?.expires_at.toISOString()).toBe("2026-07-12T03:00:00.000Z");
  });

  it("rechecks the DB after the advisory lock and uses another instance's token", async () => {
    database.setRow({
      access_token: "old-token",
      issued_at: new Date("2026-07-10T02:30:00.000Z"),
      expires_at: new Date("2026-07-11T02:59:00.000Z"),
    });
    database.setLockedRow({
      access_token: "other-instance-token",
      issued_at: new Date("2026-07-11T02:50:00.000Z"),
      expires_at: new Date("2026-07-12T02:50:00.000Z"),
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { getAccessToken } = await import("./kis-token");

    expect(await getAccessToken()).toBe("other-instance-token");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not issue a token when the shared DB is unavailable", async () => {
    database.setFailPoolRead(true);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const { getAccessToken } = await import("./kis-token");

    expect(await getAccessToken()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(JSON.stringify(warn.mock.calls)).not.toContain("DB unavailable");
    expect(warn).toHaveBeenCalledWith("[KIS] DB token lookup failed; token issuance was blocked", { errorCode: "INTEGRATION_ERROR" });
  });

  it("logs only allow-listed metadata when token issuance returns sensitive content", async () => {
    const responseBody = JSON.stringify({
      rt_cd: "1",
      msg_cd: "EGW00123",
      msg1: "appsecret=test-app-secret access_token=provider-secret",
      access_token: "provider-secret",
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers({ "content-type": "application/json; charset=utf-8" }),
      text: async () => responseBody,
    }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const { getAccessToken } = await import("./kis-token");

    expect(await getAccessToken()).toBeNull();
    expect(warn).toHaveBeenCalledWith("[KIS] Token issuance failed", {
      httpStatus: 401,
      contentType: "application/json",
      providerCode: "EGW00123",
    });
    const logOutput = JSON.stringify(warn.mock.calls);
    expect(logOutput).not.toContain("test-app-secret");
    expect(logOutput).not.toContain("provider-secret");
    expect(logOutput).not.toContain("appsecret=");
  });

  it("uses a 24-hour fallback only when KIS omits all expiry fields", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: "fallback-token" }),
    }));

    const { getAccessToken } = await import("./kis-token");
    await getAccessToken();

    expect(database.row).not.toBeNull();
    const stored = database.row!;
    expect(stored.expires_at.getTime() - stored.issued_at.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it("coalesces concurrent refreshes for one rejected token and persists one replacement", async () => {
    database.setRow({
      access_token: "rejected-token",
      issued_at: new Date("2026-07-10T03:00:00.000Z"),
      expires_at: new Date("2026-07-12T03:00:00.000Z"),
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: "replacement-token",
        access_token_token_expired: "2026-07-12 12:00:00",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { refreshAccessToken } = await import("./kis-token");
    const results = await Promise.all([
      refreshAccessToken("rejected-token"),
      refreshAccessToken("rejected-token"),
      refreshAccessToken("rejected-token"),
    ]);

    expect(results).toEqual(["replacement-token", "replacement-token", "replacement-token"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(database.row?.access_token).toBe("replacement-token");
  });

  it("reuses a replacement committed by another worker instead of issuing another token", async () => {
    database.setRow({
      access_token: "rejected-token",
      issued_at: new Date("2026-07-10T03:00:00.000Z"),
      expires_at: new Date("2026-07-12T03:00:00.000Z"),
    });
    database.setLockedRow({
      access_token: "other-worker-token",
      issued_at: new Date("2026-07-11T02:59:00.000Z"),
      expires_at: new Date("2026-07-12T02:59:00.000Z"),
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { refreshAccessToken } = await import("./kis-token");

    await expect(refreshAccessToken("rejected-token")).resolves.toBe("other-worker-token");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("backs off token issuance after a failed refresh instead of retrying on every caller", async () => {
    database.setRow({
      access_token: "rejected-token",
      issued_at: new Date("2026-07-10T03:00:00.000Z"),
      expires_at: new Date("2026-07-12T03:00:00.000Z"),
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => "token issuance rate limit",
    });
    vi.stubGlobal("fetch", fetchMock);

    const { getAccessToken, refreshAccessToken } = await import("./kis-token");

    await expect(refreshAccessToken("rejected-token")).resolves.toBeNull();
    const results = await Promise.all([getAccessToken(), getAccessToken(), getAccessToken()]);
    expect(results).toEqual([null, null, null]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
