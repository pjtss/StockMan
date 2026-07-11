import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => {
  const events = new Set<string>();
  let initialized = false;

  const client = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      if (sql.includes("SELECT 1 FROM dart_automation_state")) {
        return { rowCount: initialized ? 1 : 0 };
      }
      if (sql.includes("INSERT INTO dart_automation_state")) {
        initialized = true;
        return { rowCount: 1 };
      }
      if (sql.includes("INSERT INTO dart_automation_events")) {
        const externalId = String(params[0]);
        if (events.has(externalId)) {
          return { rowCount: 0, rows: [] };
        }
        events.add(externalId);
        return { rowCount: 1, rows: [{ external_id: externalId }] };
      }
      return { rowCount: 0, rows: [] };
    }),
    release: vi.fn(),
  };

  const pool = {
    query: vi.fn(async () => ({ rowCount: 0, rows: [] })),
    connect: vi.fn(async () => client),
  };

  return {
    client,
    events,
    pool,
    reset() {
      events.clear();
      initialized = false;
      client.query.mockClear();
      client.release.mockClear();
      pool.query.mockClear();
      pool.connect.mockClear();
    },
  };
});

vi.mock("./db", () => ({ getPool: () => database.pool }));

import { claimDartAutomation } from "./dart-automation-store";

describe("claimDartAutomation", () => {
  beforeEach(() => {
    database.reset();
  });

  it("stores the first snapshot as a baseline without claiming alerts", async () => {
    const claimed = await claimDartAutomation(["20260711000001", "20260711000002"]);

    expect(claimed.size).toBe(0);
    expect(database.events).toEqual(new Set(["20260711000001", "20260711000002"]));
  });

  it("claims only unseen receipt numbers after baseline initialization", async () => {
    await claimDartAutomation(["20260711000001"]);

    const claimed = await claimDartAutomation(["20260711000001", "20260711000002"]);

    expect(claimed).toEqual(new Set(["20260711000002"]));
  });
});
