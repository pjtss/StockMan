import { describe, expect, it, vi } from "vitest";
import { runMarketRssIngestSource } from "./market-rss-ingest-outcome";

describe("runMarketRssIngestSource", () => {
  it("returns a source-scoped diagnostic without throwing so later sources can still run", async () => {
    const nextSource = vi.fn(async () => "saved");
    const first = await runMarketRssIngestSource("NASDAQ", async () => {
      const error = Object.assign(new Error("ON CONFLICT DO UPDATE command cannot affect row a second time"), { code: "21000" });
      throw error;
    });
    const second = await runMarketRssIngestSource("SEC_EDGAR", nextSource);

    expect(first).toMatchObject({ source: "NASDAQ", ok: false, error: { errorCode: "DATABASE_CARDINALITY_VIOLATION", databaseCode: "21000" } });
    expect(second).toEqual({ source: "SEC_EDGAR", ok: true, value: "saved" });
    expect(nextSource).toHaveBeenCalledOnce();
  });
});
