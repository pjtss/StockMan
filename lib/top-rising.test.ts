import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDb = {
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockImplementationOnce(() => ({ where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }) })).mockImplementation(() => Promise.resolve([])),
  delete: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  limit: vi.fn().mockResolvedValue([]),
  insert: vi.fn().mockReturnThis(),
  values: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  set: vi.fn().mockReturnThis(),
};

vi.mock("./db", () => ({
  getDb: () => mockDb,
  getPool: () => ({ connect: vi.fn() }),
  ensureSchema: vi.fn(),
}));

import { fetchTopRisingStocks, syncTopRisingStocks } from "./kis-us";

describe("Top Rising Stocks Scanner Logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.from.mockReset().mockImplementationOnce(() => ({ where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }) })).mockImplementation(() => Promise.resolve([]));
  });

  it("fetchTopRisingStocks returns an array", async () => {
    const data = await fetchTopRisingStocks();
    expect(Array.isArray(data)).toBe(true);
  });

  it("syncTopRisingStocks returns an array", async () => {
    const result = await syncTopRisingStocks();
    expect(Array.isArray(result)).toBe(true);
  });
});
