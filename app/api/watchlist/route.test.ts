import { describe, expect, it, vi } from "vitest";

const { getUserWatchlist, addUserWatchlistItem, removeUserWatchlistItem } = vi.hoisted(() => ({
  getUserWatchlist: vi.fn(),
  addUserWatchlistItem: vi.fn(),
  removeUserWatchlistItem: vi.fn(),
}));

vi.mock("@/lib/user-watchlist", () => ({ getUserWatchlist, addUserWatchlistItem, removeUserWatchlistItem }));

import { DELETE, GET, POST } from "./route";

describe("watchlist API", () => {
  it("returns only the authenticated user's watchlist", async () => {
    getUserWatchlist.mockResolvedValueOnce([{ market: "KR", code: "005930" }]);
    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, items: [{ market: "KR", code: "005930" }] });
  });

  it("adds a normalized market/code pair", async () => {
    addUserWatchlistItem.mockResolvedValueOnce({ market: "US", code: "AAPL" });
    const response = await POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ market: "US", code: " aapl " }) }));
    expect(response.status).toBe(201);
    expect(addUserWatchlistItem).toHaveBeenCalledWith("US", "AAPL");
  });

  it("deletes a normalized market/code pair", async () => {
    removeUserWatchlistItem.mockResolvedValueOnce(true);
    const response = await DELETE(new Request("http://localhost", { method: "DELETE", body: JSON.stringify({ market: "KR", code: "005930" }) }));
    expect(response.status).toBe(200);
    expect(removeUserWatchlistItem).toHaveBeenCalledWith("KR", "005930");
  });

  it("rejects malformed JSON and non-string or oversized codes", async () => {
    const malformed = await POST(new Request("http://localhost", { method: "POST", body: "{" }));
    expect(malformed.status).toBe(400);
    const nonString = await POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ market: "KR", code: 5930 }) }));
    expect(nonString.status).toBe(400);
    const oversized = await POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ market: "KR", code: "A".repeat(33) }) }));
    expect(oversized.status).toBe(400);
    expect(addUserWatchlistItem).toHaveBeenCalledTimes(1);
  });
});
