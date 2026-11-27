import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { gunzipSync } from "node:zlib";
import { clearPublicDailyExportResponseCache, getCachedPublicDailyExport } from "@/lib/public-daily-export-response-cache";

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
    item_json: JSON.stringify({
      ticker: { market, code, name: "Example Common Stock" },
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
    }),
  };
}

function makeBatch(rows: Array<{ item_json: string }>) {
  return { items_json: `[${rows.map((row) => row.item_json).join(",")}]` };
}

function fullRequest() {
  return new Request("http://localhost/api/public/daily-export/test?format=full");
}

function waitForBackgroundStream() {
  return new Promise<void>((resolve) => setTimeout(resolve, 100));
}

describe("public gzip daily export", () => {
  beforeEach(() => {
    queryMock.mockReset();
    clearPublicDailyExportResponseCache();
  });
  afterEach(() => vi.restoreAllMocks());

  it.each([
    ["KR", getKrExport, "kr_common_stock_universe", "005930", "KRW"],
    ["US", getUsExport, "us_common_stock_universe", "AAPL", "USD"],
  ] as const)("returns a no-auth, no-store gzip JSON export for %s", async (market, getExport, universeTable, code, currency) => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ market: market === "KR" ? "KOSPI" : "NAS", code, name: "Example Common Stock" }] })
      .mockResolvedValue({ rows: [makeBatch([makeRow(market === "KR" ? "KOSPI" : "NAS", code, currency)])] });

    const response = await getExport(fullRequest());
    const compressed = Buffer.from(await response.arrayBuffer());
    const payload = JSON.parse(gunzipSync(compressed).toString("utf8"));
    const [eligibilitySql] = queryMock.mock.calls[0] as [string];
    const [batchQuery] = queryMock.mock.calls[1] as [{ name: string; text: string; values: [string] }];
    const { name, text: sql, values } = batchQuery;
    const requestParameter = values[0];

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/gzip");
    expect(response.headers.get("content-disposition")).toBe(`attachment; filename="daily-candles-${market.toLowerCase()}.json.gz"`);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("content-encoding")).toBeNull();
    expect(response.headers.get("content-length")).toBeNull();
    expect(response.headers.get("x-accel-buffering")).toBe("no");
    expect(response.headers.get("x-public-daily-export-cache")).toBe("MISS");
    expect(compressed[8]).toBe(2); // RFC 1952 XFL=2 marks maximum deflate compression.
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
    expect(eligibilitySql).toContain("SELECT u.market, u.code, u.name");
    expect(eligibilitySql).toContain("u.instrument_type='COMMON_STOCK'");
    expect(sql).toContain("FROM jsonb_to_recordset($1::jsonb)");
    expect(sql).toContain(`/* public-daily-export-market: ${market.toLowerCase()} */`);
    expect(JSON.stringify(requestParameter)).toContain(code);
    expect(name).toBe(`public-daily-export-${market.toLowerCase()}-batch-v2`);
    expect(sql).not.toContain(universeTable);
    expect(JSON.stringify(requestParameter)).toContain("Example Common Stock");
    expect(sql).toContain("LEFT JOIN public_daily_export_candle_summaries d");
    expect(sql).toContain("LEFT JOIN instrument_fundamental_snapshots f");
    expect(sql).toContain("d.full_candles");
    expect(sql).not.toContain("to_jsonb(c)");
    expect(sql).toContain("json_build_object(");
    expect(sql).toContain("string_agg(row_to_json(payload)::text, ',' ORDER BY r.market, r.code)");
    expect(sql).toContain('AS "marketCap"');
    expect(sql).toContain("item(market text, code text, name text)");
    expect(sql).toContain("'market', r.market, 'code', r.code, 'name', r.name");
    expect(sql).not.toContain("u.instrument_type='COMMON_STOCK'");
    expect(sql).not.toContain("LIMIT 20");
    expect(sql).not.toContain("FROM kr_recent_daily_candles c");
    expect(sql).not.toContain("FROM us_recent_daily_candles c");
    if (market === "US") {
      expect(eligibilitySql).toContain("u.is_dr=false");
      expect(eligibilitySql).toContain("COALESCE(u.english_name, '') !~*");
      expect(eligibilitySql).toContain("COALESCE(u.name, '') !~*");
    }
    expect(queryMock).toHaveBeenCalledTimes(2);
  });

  it("defaults to compact tuples and preserves the full-data fields", async () => {
    const compactItem = JSON.parse(makeRow("KOSPI", "005930", "KRW").item_json);
    compactItem.daily = {
      ...compactItem.daily,
      candleEncoding: "tuple-v1",
      candleFields: ["date", "open", "high", "low", "close", "volume", "tradingValue", "fetchedAt"],
      candles: compactItem.daily.candles.map((entry: Record<string, unknown>) =>
        ["date", "open", "high", "low", "close", "volume", "tradingValue", "fetchedAt"].map((field) => entry[field]),
      ),
    };
    queryMock
      .mockResolvedValueOnce({ rows: [{ market: "KOSPI", code: "005930", name: "Example Common Stock", has_trading_value: true }] })
      .mockResolvedValueOnce({ rows: [makeBatch([{ item_json: JSON.stringify(compactItem) }])] });

    const response = await getKrExport(new Request("http://localhost/api/public/daily-export/kr"));
    const compressed = Buffer.from(await response.arrayBuffer());
    const payload = JSON.parse(gunzipSync(compressed).toString("utf8"));
    const sql = (queryMock.mock.calls[1]?.[0] as { text: string }).text;

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/gzip");
    expect(response.headers.get("content-disposition")).toContain("daily-candles-kr-compact.json.gz");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("content-encoding")).toBeNull();
    expect(compressed[8]).toBe(2);
    expect(payload).toHaveLength(1);
    expect(payload[0].ticker).toEqual({ market: "KOSPI", code: "005930", name: "Example Common Stock" });
    expect(payload[0].marketCap).toMatchObject({ value: 123456789000, currency: "KRW" });
    expect(payload[0].daily.candleEncoding).toBe("tuple-v1");
    expect(payload[0].daily.candleFields).toEqual(["date", "open", "high", "low", "close", "volume", "tradingValue", "fetchedAt"]);
    expect(payload[0].daily.candles).toEqual([["20261124", 100, 110, 95, 105, 1_000, 105_000, "2026-11-24T07:00:00.000Z"]]);
    expect(payload[0].daily.metadata.returnedCount).toBe(payload[0].daily.candles.length);
    expect(payload[0].daily.candles.length).toBeLessThanOrEqual(20);
    expect(Object.keys(payload[0])).toEqual(["ticker", "marketCap", "daily"]);
    expect(sql).toContain("d.compact_candles");
  });

  it("rejects unsupported daily export formats without querying the DB", async () => {
    const response = await getKrExport(new Request("http://localhost/api/public/daily-export/kr?format=unknown"));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: "INVALID_FORMAT" });
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("returns 503 when the official active common-stock universe is empty", async () => {
    queryMock.mockResolvedValue({ rows: [] });
    const response = await getKrExport(fullRequest());

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, error: "DAILY_EXPORT_UNAVAILABLE" });
  });

  it("serves a completed gzip snapshot from the bounded server cache", async () => {
    queryMock.mockResolvedValue({ rows: [makeRow("KOSPI", "005930", "KRW")] });

    const first = await getKrExport(fullRequest());
    const firstBytes = Buffer.from(await first.arrayBuffer());
    const second = await getKrExport(fullRequest());
    const secondBytes = Buffer.from(await second.arrayBuffer());

    expect(first.headers.get("cache-control")).toContain("no-store");
    expect(first.headers.get("x-public-daily-export-cache")).toBe("MISS");
    expect(second.headers.get("cache-control")).toContain("no-store");
    expect(second.headers.get("x-public-daily-export-cache")).toBe("HIT");
    expect(secondBytes).toEqual(firstBytes);
    expect(JSON.parse(gunzipSync(secondBytes).toString("utf8"))).toHaveLength(1);
    expect(queryMock).toHaveBeenCalledTimes(2);
  });

  it("serves stale gzip immediately and refreshes the snapshot in the background", async () => {
    const eligible = { market: "KOSPI", code: "005930", name: "Example Common Stock", has_trading_value: true };
    const batch = makeRow("KOSPI", "005930", "KRW");
    queryMock.mockResolvedValueOnce({ rows: [eligible] }).mockResolvedValueOnce({ rows: [batch] });

    const initial = await getKrExport(fullRequest());
    const initialBytes = Buffer.from(await initial.arrayBuffer());
    expect(initial.headers.get("x-public-daily-export-cache")).toBe("MISS");

    queryMock.mockClear();
    queryMock.mockResolvedValueOnce({ rows: [eligible] }).mockResolvedValueOnce({ rows: [batch] });
    const dateNow = Date.now();
    const dateNowSpy = vi.spyOn(Date, "now").mockReturnValue(dateNow + 60_001);

    const stale = await getKrExport(fullRequest());
    const staleBytes = Buffer.from(await stale.arrayBuffer());
    expect(stale.status).toBe(200);
    expect(stale.headers.get("cache-control")).toContain("no-store");
    expect(stale.headers.get("x-public-daily-export-cache")).toBe("STALE");
    expect(staleBytes).toEqual(initialBytes);

    await waitForBackgroundStream();
    expect(queryMock).toHaveBeenCalledTimes(2);
    expect(getCachedPublicDailyExport("KR", "full")?.state).toBe("HIT");
    dateNowSpy.mockRestore();

    const refreshed = await getKrExport(fullRequest());
    expect(refreshed.headers.get("x-public-daily-export-cache")).toBe("HIT");
    expect(Buffer.from(await refreshed.arrayBuffer())).toEqual(initialBytes);
    expect(queryMock).toHaveBeenCalledTimes(2);
  });

  it("coalesces concurrent stale requests into one background database refresh", async () => {
    const eligible = { market: "KOSPI", code: "005930", name: "Example Common Stock", has_trading_value: true };
    const batch = makeRow("KOSPI", "005930", "KRW");
    queryMock.mockResolvedValueOnce({ rows: [eligible] }).mockResolvedValueOnce({ rows: [batch] });
    const initial = await getKrExport(fullRequest());
    await initial.arrayBuffer();

    let resolveUniverse: ((value: { rows: typeof eligible[] }) => void) | undefined;
    let resolveBatch: ((value: { rows: typeof batch[] }) => void) | undefined;
    queryMock.mockClear();
    queryMock.mockImplementation(() => new Promise((resolve) => {
      if (!resolveUniverse) resolveUniverse = resolve;
      else resolveBatch = resolve;
    }));
    const dateNow = Date.now();
    const dateNowSpy = vi.spyOn(Date, "now").mockReturnValue(dateNow + 60_001);

    const [firstStale, secondStale] = await Promise.all([
      getKrExport(fullRequest()),
      getKrExport(fullRequest()),
    ]);
    expect(firstStale.headers.get("x-public-daily-export-cache")).toBe("STALE");
    expect(secondStale.headers.get("x-public-daily-export-cache")).toBe("STALE");
    await Promise.all([firstStale.arrayBuffer(), secondStale.arrayBuffer()]);
    expect(queryMock).toHaveBeenCalledTimes(1);

    resolveUniverse?.({ rows: [eligible] });
    await waitForBackgroundStream();
    expect(queryMock).toHaveBeenCalledTimes(2);
    resolveBatch?.({ rows: [batch] });
    await waitForBackgroundStream();
    expect(getCachedPublicDailyExport("KR", "full")?.state).toBe("HIT");
    dateNowSpy.mockRestore();
  });

  it("logs database, streaming, first-byte, and gzip timings after the response completes", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    queryMock
      .mockResolvedValueOnce({ rows: [{ market: "KOSPI", code: "005930", name: "Example Common Stock", has_trading_value: true }] })
      .mockResolvedValueOnce({ rows: [makeRow("KOSPI", "005930", "KRW")] });

    const response = await getKrExport(fullRequest());
    await response.arrayBuffer();

    const performanceLog = infoSpy.mock.calls.find(([message]) =>
      message === "[API /public/daily-export/kr] performance",
    );
    expect(performanceLog?.[1]).toMatchObject({
      market: "KR",
      tickerCount: 1,
      batchCount: 1,
      batchQueryCount: 1,
      batchWaveCount: 1,
    });
    expect(performanceLog?.[1]).toEqual(expect.objectContaining({
      universeQueryMs: expect.any(Number),
      batchQueryWallMs: expect.any(Number),
      batchQueryDurationMs: expect.any(Number),
      maxBatchQueryMs: expect.any(Number),
      timeToFirstGzipByteMs: expect.any(Number),
      streamDurationMs: expect.any(Number),
      totalElapsedMs: expect.any(Number),
      gzipBytes: expect.any(Number),
    }));
  });

  it("reads precomputed candle summaries without inspecting the candle schema", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ market: "KOSPI", code: "005930", name: "Example Common Stock" }] })
      .mockResolvedValueOnce({ rows: [makeRow("KOSPI", "005930", "KRW")] });

    const response = await getKrExport(fullRequest());
    await response.arrayBuffer();
    const [universeSql] = queryMock.mock.calls[0] as [string];
    const [{ text: sql }] = queryMock.mock.calls[1] as [{ text: string }];

    expect(response.status).toBe(200);
    expect(universeSql).not.toContain("pg_attribute");
    expect(sql).toContain("LEFT JOIN public_daily_export_candle_summaries d");
    expect(sql).toContain("d.full_candles");
    expect(sql).not.toContain("us_recent_daily_candles");
    expect(sql).not.toContain("kr_recent_daily_candles");
  });

  it("splits large ticker universes into bounded 500-ticker lookup batches", async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: Array.from({ length: 1_001 }, (_, index) => ({ market: "KOSPI", code: `T${index}`, name: "Example Common Stock", has_trading_value: true })),
      })
      .mockResolvedValue({ rows: [makeRow("KOSPI", "005930", "KRW")] });

    const response = await getKrExport(fullRequest());
    await response.arrayBuffer();
    const batchSizes = queryMock.mock.calls.slice(1).map(([query]) =>
      JSON.parse((query as { values: [string] }).values[0]).length,
    );

    expect(response.status).toBe(200);
    expect(batchSizes).toEqual([500, 500, 1]);
    expect(queryMock).toHaveBeenCalledTimes(4);
  });

  it("splits US ticker universes into bounded 1,000-ticker lookup batches", async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: Array.from({ length: 2_501 }, (_, index) => ({ market: "NAS", code: `T${index}`, name: "Example Common Stock", has_trading_value: true })),
      })
      .mockResolvedValue({ rows: [makeRow("NAS", "AAPL", "USD")] });

    const response = await getUsExport(fullRequest());
    await response.arrayBuffer();
    const batchSizes = queryMock.mock.calls.slice(1).map(([query]) =>
      JSON.parse((query as { values: [string] }).values[0]).length,
    );

    expect(response.status).toBe(200);
    expect(batchSizes).toEqual([1_000, 1_000, 501]);
  });

  it("keeps US batch lookups in one wave below ten concurrent queries", async () => {
    let active = 0;
    let peakActive = 0;
    queryMock
      .mockResolvedValueOnce({
        rows: Array.from({ length: 5_501 }, (_, index) => ({ market: "NAS", code: `T${index}`, name: "Example Common Stock", has_trading_value: true })),
      })
      .mockImplementation(async () => {
        active += 1;
        peakActive = Math.max(peakActive, active);
        await new Promise((resolve) => setTimeout(resolve, 1));
        active -= 1;
        return { rows: [makeRow("NAS", "AAPL", "USD")] };
      });

    const response = await getUsExport(fullRequest());
    await response.arrayBuffer();

    expect(response.status).toBe(200);
    expect(queryMock).toHaveBeenCalledTimes(7);
    expect(peakActive).toBe(6);
  });

  it("keeps KR batch lookups at five concurrent queries", async () => {
    let active = 0;
    let peakActive = 0;
    queryMock
      .mockResolvedValueOnce({
        rows: Array.from({ length: 2_501 }, (_, index) => ({ market: "KOSPI", code: `T${index}`, name: "Example Common Stock", has_trading_value: true })),
      })
      .mockImplementation(async () => {
        active += 1;
        peakActive = Math.max(peakActive, active);
        await new Promise((resolve) => setTimeout(resolve, 1));
        active -= 1;
        return { rows: [makeRow("KOSPI", "005930", "KRW")] };
      });

    const response = await getKrExport(fullRequest());
    await response.arrayBuffer();

    expect(response.status).toBe(200);
    expect(queryMock).toHaveBeenCalledTimes(7);
    expect(peakActive).toBe(5);
  });

  it("keeps the gzip response flowing while a database batch is pending", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ market: "KOSPI", code: "005930", name: "Example Common Stock", has_trading_value: true }] })
      .mockImplementationOnce(() => new Promise((resolve) => {
        setTimeout(() => resolve({ rows: [makeRow("KOSPI", "005930", "KRW")] }), 8_000);
      }));

    const response = await getKrExport(fullRequest());
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

  it("streams an earlier completed batch while a later concurrent batch is still pending", async () => {
    let batchIndex = 0;
    queryMock
      .mockResolvedValueOnce({
        rows: Array.from({ length: 501 }, (_, index) => ({ market: "KOSPI", code: `T${String(index).padStart(4, "0")}`, name: "Example Common Stock", has_trading_value: true })),
      })
      .mockImplementation(async () => {
        const index = batchIndex++;
        if (index === 1) await new Promise((resolve) => setTimeout(resolve, 4_000));
        return { rows: Array.from({ length: index === 0 ? 500 : 1 }, (_, rowIndex) => makeRow("KOSPI", `T${String(index * 500 + rowIndex).padStart(4, "0")}`, "KRW")) };
      });

    const response = await getKrExport(fullRequest());
    const reader = response.body!.getReader();
    const firstChunk = await reader.read();
    const waitingSince = Date.now();
    const firstBatchChunk = await reader.read();

    expect(firstChunk.done).toBe(false);
    expect(firstBatchChunk.done).toBe(false);
    expect(Date.now() - waitingSince).toBeLessThan(3_000);

    const chunks = [Buffer.from(firstChunk.value!), Buffer.from(firstBatchChunk.value!)];
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      chunks.push(Buffer.from(part.value));
    }
    const payload = JSON.parse(gunzipSync(Buffer.concat(chunks)).toString("utf8"));
    expect(payload).toHaveLength(501);
    expect(payload[0].ticker.code).toBe("T0000");
    expect(payload.at(-1).ticker.code).toBe("T0500");
  });

  it.each([
    ["KR", getKrExport, "KOSPI", "KRW", 500],
    ["US", getUsExport, "NAS", "USD", 1_000],
  ] as const)("uses the configured %s public export batch size", async (market, getExport, exchange, currency, batchSize) => {
    const universeRows = Array.from({ length: batchSize + 1 }, (_, index) => ({
      market: exchange,
      code: `T${String(index).padStart(5, "0")}`,
      name: "Example Common Stock",
      has_trading_value: true,
    }));
    let offset = 0;
    queryMock
      .mockResolvedValueOnce({ rows: universeRows })
      .mockImplementation(async () => {
        const batch = universeRows.slice(offset, offset + batchSize);
        offset += batchSize;
        return { rows: batch.map(({ market: itemMarket, code }) => makeRow(itemMarket, code, currency)) };
      });

    const response = await getExport(fullRequest());
    const compressed = Buffer.from(await response.arrayBuffer());
    const payload = JSON.parse(gunzipSync(compressed).toString("utf8"));
    const batchSizes = queryMock.mock.calls.slice(1).map(([query]) =>
      JSON.parse((query as { values: [string] }).values[0]).length,
    );

    expect(response.status).toBe(200);
    expect(payload).toHaveLength(batchSize + 1);
    expect(batchSizes).toEqual([batchSize, 1]);
    expect(payload.every((item: { ticker: { market: string }; marketCap: unknown; daily: { candles: unknown[] } }) =>
      item.ticker.market === exchange && item.marketCap && item.daily.candles.length <= 20,
    )).toBe(true);
    expect(market).toBe(exchange === "KOSPI" ? "KR" : "US");
  });

  it("returns 503 when the read-only export query fails", async () => {
    queryMock.mockResolvedValue({ rows: null });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await getUsExport(fullRequest());

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, error: "DAILY_EXPORT_UNAVAILABLE" });
  });
});
