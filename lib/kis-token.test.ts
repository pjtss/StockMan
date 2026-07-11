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
      expires_at: new Date("2026-07-11T03:30:00.000Z"),
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { getAccessToken } = await import("./kis-token");

    expect(await getAccessToken()).toBe("same-day-token");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("coalesces concurrent refreshes into one issuance and persists the official expiry", async () => {
    database.setRow({
      access_token: "expiring-token",
      issued_at: new Date("2026-07-10T02:30:00.000Z"),
      expires_at: new Date("2026-07-11T03:30:00.000Z"),
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
      expires_at: new Date("2026-07-11T03:30:00.000Z"),
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

    const { getAccessToken } = await import("./kis-token");

    expect(await getAccessToken()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
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
});
