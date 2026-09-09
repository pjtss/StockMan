import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.fn();
const release = vi.fn();
const connect = vi.fn(async () => ({ query, release }));

vi.mock("@/lib/db", () => ({ getPool: () => ({ connect }) }));

describe("saveUsTopRisingSnapshot", () => {
  beforeEach(() => {
    query.mockReset();
    release.mockReset();
    query.mockResolvedValue({ rows: [] });
    query.mockResolvedValueOnce({ rows: [] });
    query.mockResolvedValueOnce({ rows: [{ id: "42" }] });
  });

  it("persists all items in one batch insert", async () => {
    const { saveUsTopRisingSnapshot } = await import("./us-top-rising-snapshot");
    const id = await saveUsTopRisingSnapshot({
      ok: true,
      markets: [{ market: "NAS", sourceCount: 100 }],
      scopes: [
        { market: "NAS", code: "AAA", name: "Alpha", rank: 1, changeRate: 12 },
        { market: "NAS", code: "BBB", name: "Beta", rank: 2, changeRate: 10 },
      ],
    });

    expect(id).toBe("42");
    expect(query).toHaveBeenCalledWith("BEGIN");
    const itemInsert = query.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO us_top_rising_snapshot_items"));
    expect(itemInsert).toBeDefined();
    expect(String(itemInsert?.[0])).toContain("($1,$2,$3,$4,$5,$6),($7,$8,$9,$10,$11,$12)");
    expect(query.mock.calls.filter(([sql]) => String(sql).includes("INSERT INTO us_top_rising_snapshot_items"))).toHaveLength(1);
    expect(query).toHaveBeenCalledWith("COMMIT");
    expect(release).toHaveBeenCalledOnce();
  });
});
