import { describe, expect, it, vi } from "vitest";

const query = vi.fn();
vi.mock("./db", () => ({ getPool: () => ({ query }) }));
vi.mock("./user-auth", () => ({ getCurrentUser: vi.fn(async () => ({ id: 7, username: "tester" })) }));

describe("user notes", () => {
  it("loads notes only for the current user", async () => {
    query.mockResolvedValueOnce({ rows: [{ id: "1", title: "메모", content: "# 내용", created_at: "2026-09-10T00:00:00Z", updated_at: "2026-09-10T00:00:00Z" }] });
    const { listUserNotes } = await import("./user-notes");
    expect(await listUserNotes()).toMatchObject([{ id: 1, title: "메모", content: "# 내용" }]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("WHERE user_id=$1"), [7]);
  });
});
