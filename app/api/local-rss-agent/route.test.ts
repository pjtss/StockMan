import { afterEach, describe, expect, it, vi } from "vitest";

const query = vi.fn();
vi.mock("@/lib/db", () => ({ getPool: () => ({ query }) }));

import { GET, POST } from "./route";

const readAuth = { authorization: "Bearer local-read-token" };
const writeAuth = { authorization: "Bearer local-write-token" };

describe("/api/local-rss-agent", () => {
  afterEach(() => { query.mockReset(); vi.unstubAllEnvs(); });

  it("requires the dedicated local-agent credential", async () => {
    vi.stubEnv("LOCAL_RSS_AGENT_READ_TOKEN", "local-read-token");
    const response = await GET(new Request("https://stockman.example/api/local-rss-agent?kind=articles"));
    expect(response.status).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });

  it("returns only unsaved article revisions using the bounded query", async () => {
    vi.stubEnv("LOCAL_RSS_AGENT_READ_TOKEN", "local-read-token");
    query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    query.mockResolvedValueOnce({ rows: [{ startedAt: "2026-09-26T10:00:00Z" }], rowCount: 1 });
    query.mockResolvedValueOnce({ rows: [{ source: "STOCKTITAN", externalId: "id-1", revisionHash: "a".repeat(32) }], rowCount: 1 });
    const response = await GET(new Request("https://stockman.example/api/local-rss-agent?kind=articles&limit=999", { headers: readAuth }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, count: 1, articles: [{ externalId: "id-1" }] });
    expect(query.mock.calls[2][1]).toEqual([50, "2026-09-26T10:00:00Z"]);
    expect(query.mock.calls[2][0]).toContain("NOT EXISTS");
  });

  it("claims delivery with compare-and-set and rejects a duplicate transition", async () => {
    vi.stubEnv("LOCAL_RSS_AGENT_WRITE_TOKEN", "local-write-token");
    query.mockResolvedValueOnce({ rows: [{ id: "12", status: "SENDING" }] });
    const response = await POST(new Request("https://stockman.example/api/local-rss-agent", {
      method: "POST", headers: { ...writeAuth, "content-type": "application/json" },
      body: JSON.stringify({ kind: "delivery", id: "12", status: "SENDING" }),
    }));
    expect(response.status).toBe(200);
    expect(query.mock.calls[0][0]).toContain("delivery_status=$5");
    query.mockResolvedValueOnce({ rows: [] });
    const conflict = await POST(new Request("https://stockman.example/api/local-rss-agent", {
      method: "POST", headers: { ...writeAuth, "content-type": "application/json" },
      body: JSON.stringify({ kind: "delivery", id: "12", status: "SENDING" }),
    }));
    expect(conflict.status).toBe(409);
  });

  it("records each analysis revision and marks first versus previously analyzed tickers", async () => {
    vi.stubEnv("LOCAL_RSS_AGENT_WRITE_TOKEN", "local-write-token");
    query.mockResolvedValueOnce({ rows: [{ code: "NVDA", name: "NVIDIA" }] });
    query.mockResolvedValueOnce({ rows: [] });
    query.mockResolvedValueOnce({ rows: [{ id: "18", notify: true }] });
    const response = await POST(new Request("https://stockman.example/api/local-rss-agent", {
      method: "POST", headers: { ...writeAuth, "content-type": "application/json" }, body: JSON.stringify({ kind: "analyses", analyses: [{
        source: "STOCKTITAN", externalId: "nvda-news", revisionHash: "a".repeat(32), decision: "POSITIVE", ticker: "NVDA",
        confidence: "HIGH", eventType: "계약", translatedTitleKo: "대형 공급 계약", analysisKo: "매출 가시성을 높일 수 있습니다.",
        evidenceQuotes: ["multi-year supply agreement"], risksKo: "인식 시점 확인 필요", priority: 80,
      }] }),
    }));
    expect(response.status).toBe(200);
    expect(query.mock.calls[2][0]).toContain("market_rss_llm_analyses");
    expect(query.mock.calls[2][1]).toContain("NEW");
    expect(query.mock.calls[2][0]).toContain("strpos(lower(concat_ws");
  });
});
