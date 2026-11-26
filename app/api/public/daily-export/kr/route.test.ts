import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { gunzipSync } from "node:zlib";

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));
vi.mock("@/lib/db", () => ({ getPool: () => ({ query: queryMock }) }));

import { GET as getKrExport } from "./route";
import { GET as getUsExport } from "../us/route";

const candle = {
  date: "20261124",
  open: 100,
  high: 110,
  low: 95,
  close: 105,
  volume: 1_000,
  tradingValue: 105_000,
  fetchedAt: "2026-11-24T07:00:00.000Z",
};

function makeRow(market: string, code: string, currency: string) {
  return {
    market,
    code,
    name: "Example Common Stock",
    market_cap: "123456789000",
    market_cap_currency: currency,
    market_cap_observed_at: "2026-11-24T07:00:00.000Z",
    market_cap_fetched_at: "2026-11-24T07:01:00.000Z",
    candles: [candle],
    latest_candle_date: "20261124",
    data_updated_at: "2026-11-24T07:00:00.000Z",
    returned_count: 1,
  };
}

describe("public gzip daily export", () => {
  beforeEach(() => queryMock.mockReset());
  afterEach(() => vi.restoreAllMocks());

  it.each([
    ["KR", getKrExport, "kr_common_stock_universe", "kr_instrument_universe_candles", "005930", "KRW"],
    ["US", getUsExport, "us_common_stock_universe", "us_instrument_universe_candles", "AAPL", "USD"],
  ] as const)("returns a no-auth, no-store gzip JSON export for %s", async (market, getExport, universeTable, candleTable, code, currency) => {
    queryMock.mockResolvedValue({ rows: [makeRow(market === "KR" ? "KOSPI" : "NAS", code, currency)] });

    const response = await getExport();
    const compressed = Buffer.from(await response.arrayBuffer());
    const payload = JSON.parse(gunzipSync(compressed).toString("utf8"));
    const [eligibilitySql] = queryMock.mock.calls[0] as [string];
    const [sql, requestParameter] = queryMock.mock.calls[1] as [string, string];

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/gzip");
    expect(response.headers.get("content-disposition")).toBe(`attachment; filename="daily-candles-${market.toLowerCase()}.json.gz"`);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("content-encoding")).toBeNull();
    expect(response.headers.get("content-length")).toBeNull();
    expect(response.headers.get("x-accel-buffering")).toBe("no");
    expect(compressed[8]).toBe(4); // RFC 1952 XFL=4 identifies fastest gzip compression.
    expect(payload).toEqual([{
      ticker: { market: market === "KR" ? "KOSPI" : "NAS", code, name: "Example Common Stock" },
      marketCap: {
        value: 123456789000,
        currency,
        observedAt: "2026-11-24T07:00:00.000Z",
        fetchedAt: "2026-11-24T07:01:00.000Z",
      },
      daily: {
        candles: [candle],
        metadata: {
          latestCandleDate: "20261124",
          dataUpdatedAt: "2026-11-24T07:00:00.000Z",
          returnedCount: 1,
        },
      },
    }]);
    expect(Object.keys(payload[0])).toEqual(["ticker", "marketCap", "daily"]);
    expect(eligibilitySql).toContain(`FROM ${universeTable} u`);
    expect(eligibilitySql).toContain("u.instrument_type='COMMON_STOCK'");
    expect(sql).toContain("FROM jsonb_to_recordset($1::jsonb)");
    expect(JSON.stringify(requestParameter)).toContain(code);
    expect(sql).toContain(`JOIN ${universeTable} u`);
    expect(sql).toContain(`FROM ${candleTable} c`);
    expect(sql).toContain("LEFT JOIN instrument_fundamental_snapshots f");
    expect(sql).toContain("to_jsonb(c)->>'trading_value'");
    expect(sql).toContain("u.instrument_type='COMMON_STOCK'");
    expect(sql).toContain("LIMIT 20");
    if (market === "US") {
      expect(sql).toContain("u.is_dr=false");
      expect(sql).toContain("COALESCE(u.english_name, '') !~*");
      expect(sql).toContain("COALESCE(u.name, '') !~*");
    }
    expect(queryMock).toHaveBeenCalledTimes(2);
  });

  it("returns 503 when the official active common-stock universe is empty", async () => {
    queryMock.mockResolvedValue({ rows: [] });
    const response = await getKrExport();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, error: "DAILY_EXPORT_UNAVAILABLE" });
  });

  it("reads and recompresses the database snapshot on every request", async () => {
    queryMock.mockResolvedValue({ rows: [makeRow("KOSPI", "005930", "KRW")] });

    const first = await getKrExport();
    await first.arrayBuffer();
    const second = await getKrExport();
    await second.arrayBuffer();

    expect(first.headers.get("cache-control")).toContain("no-store");
    expect(second.headers.get("cache-control")).toContain("no-store");
    expect(queryMock).toHaveBeenCalledTimes(4);
  });

  it("splits large ticker universes into bounded 500-ticker lookup batches", async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: Array.from({ length: 1_001 }, (_, index) => ({ market: "KOSPI", code: `T${index}` })),
      })
      .mockResolvedValue({ rows: [makeRow("KOSPI", "005930", "KRW")] });

    const response = await getKrExport();
    await response.arrayBuffer();
    const batchSizes = queryMock.mock.calls.slice(1).map(([, parameters]) =>
      JSON.parse((parameters as [string])[0]).length,
    );

    expect(response.status).toBe(200);
    expect(batchSizes).toEqual([500, 500, 1]);
    expect(queryMock).toHaveBeenCalledTimes(4);
  });

  it("keeps the gzip response flowing while a database batch is pending", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ market: "KOSPI", code: "005930" }] })
      .mockImplementationOnce(() => new Promise((resolve) => {
        setTimeout(() => resolve({ rows: [makeRow("KOSPI", "005930", "KRW")] }), 8_000);
      }));

    const response = await getKrExport();
    const reader = response.body!.getReader();
    const firstChunk = await reader.read();
    const waitingSince = Date.now();
    const heartbeatChunk = await reader.read();

    expect(firstChunk.done).toBe(false);
    expect(heartbeatChunk.done).toBe(false);
    expect(Date.now() - waitingSince).toBeLessThan(7_500);

    const chunks = [Buffer.from(firstChunk.value!), Buffer.from(heartbeatChunk.value!)];
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      chunks.push(Buffer.from(part.value));
    }
    const payload = JSON.parse(gunzipSync(Buffer.concat(chunks)).toString("utf8"));
    expect(payload).toHaveLength(1);
    expect(payload[0].ticker.code).toBe("005930");
  });

  it("returns 503 when the read-only export query fails", async () => {
    queryMock.mockResolvedValue({ rows: null });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await getUsExport();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, error: "DAILY_EXPORT_UNAVAILABLE" });
  });
});
