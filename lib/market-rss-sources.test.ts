import { describe, expect, it, vi } from "vitest";
import { fetchAllMarketRss } from "./market-rss-sources";
vi.mock("./globenewswire-rss", () => ({ fetchGlobeNewswireRss: vi.fn().mockRejectedValue(new Error("test failure")) }));
vi.mock("./nasdaq-rss", () => ({ fetchNasdaqRss: vi.fn().mockResolvedValue({ source: "NASDAQ", items: [] }) }));
vi.mock("./nasdaq-trader-rss", () => ({ fetchNasdaqTraderRss: vi.fn().mockResolvedValue({ source: "NASDAQ_TRADER", items: [] }) }));
vi.mock("./sec-edgar-rss", () => ({ fetchSecEdgarRss: vi.fn().mockResolvedValue({ source: "SEC_EDGAR", items: [] }) }));
vi.mock("./stocktitan-rss", () => ({ fetchStockTitanRss: vi.fn().mockResolvedValue({ source: "STOCKTITAN", items: [] }) }));
describe("market RSS sources", () => { it("isolates source failures", async () => { const result = await fetchAllMarketRss(); expect(result.results.find((item) => item.source === "GLOBENEWSWIRE")?.ok).toBe(false); expect(result.results.filter((item) => item.ok)).toHaveLength(4); }); });
