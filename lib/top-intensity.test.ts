import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock pg
const mockClient = {
  query: vi.fn().mockResolvedValue({}),
  release: vi.fn(),
};

const mockPool = {
  connect: vi.fn().mockResolvedValue(mockClient),
};

vi.mock("pg", () => {
  return {
    Pool: class {
      connect() {
        return mockPool.connect();
      }
    }
  };
});

// Mock getDb
const mockDb = {
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  delete: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  values: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  set: vi.fn().mockReturnThis(),
};

vi.mock("./db", () => {
  return {
    getDb: () => mockDb,
    getPool: () => mockPool,
    ensureSchema: vi.fn(),
  };
});

import { fetchTradingIntensity, syncTradingIntensityStocks } from "./kis";

describe("Top Trading Intensity Stocks Logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetchTradingIntensity in test environment returns mocked items", async () => {
    const data = await fetchTradingIntensity();
    expect(data).toHaveLength(10);
    expect(data[0].company).toBe("가짜 종목 A");
    expect(data[0].code).toBe("000000");
    expect(data[0].intensity).toBeGreaterThan(0);
  });

  it("syncTradingIntensityStocks deletes obsolete items and inserts/updates others", async () => {
    // 10 items returned by fetchTradingIntensity are code 000000 to 000009
    const oldTop10 = [
      { code: "000000", company: "가짜 종목 A", intensity: 180, price: "75,000", changeRate: "+1.50%", addedAt: new Date() },
      { code: "DEL", company: "Delete Me", intensity: 120, price: "20,000", changeRate: "+1.00%", addedAt: new Date() },
    ];

    mockDb.select.mockReturnThis();
    mockDb.from.mockResolvedValue(oldTop10);

    const newlyAdded = await syncTradingIntensityStocks();

    // Out of the 10 fetched in test, 1 (000000) already exists, so 9 should be newly added.
    expect(newlyAdded).toHaveLength(9);

    expect(mockDb.delete).toHaveBeenCalled();
    expect(mockDb.insert).toHaveBeenCalled();
    expect(mockDb.update).toHaveBeenCalled();
  });

  it("syncTradingIntensityStocks clears database table when session date changes (UTC+9)", async () => {
    // addedAt date is set to 2 days ago to simulate day change
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

    const oldTop10 = [
      { code: "000000", company: "가짜 종목 A", intensity: 180, price: "75,000", changeRate: "+1.50%", addedAt: twoDaysAgo },
    ];

    mockDb.select.mockReturnThis();
    mockDb.from.mockResolvedValue(oldTop10);

    const newlyAdded = await syncTradingIntensityStocks();

    // Since the date is old, the entire table is cleared. 000000 is deleted first, then inserted fresh.
    // So all 10 are newly added.
    expect(newlyAdded).toHaveLength(10);
    
    // Deletes the whole table first because date changed, then obsolete is skipped because oldTop10 is empty
    expect(mockDb.delete).toHaveBeenCalledTimes(1); 
  });
});
