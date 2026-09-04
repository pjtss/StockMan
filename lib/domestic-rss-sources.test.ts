import { afterEach, describe, expect, it, vi } from "vitest";
import { DOMESTIC_RSS_SOURCES, domesticRssConfig, fetchDomesticRss, fetchAllDomesticRss } from "./domestic-rss-sources";

const originalUrls = Object.fromEntries(DOMESTIC_RSS_SOURCES.map((source) => [source, process.env[`${source}_RSS_URL`]]));

afterEach(() => {
  vi.restoreAllMocks();
  for (const source of DOMESTIC_RSS_SOURCES) {
    const envName = source === "KRX_KIND" ? "KRX_KIND_RSS_URL" : source === "NEWSIS" ? "NEWSIS_RSS_URL" : source === "MK" ? "MK_RSS_URL" : source === "HANKYUNG" ? "HANKYUNG_RSS_URL" : "ETODAY_RSS_URL";
    const value = originalUrls[source];
    if (value == null) delete process.env[envName];
    else process.env[envName] = value;
  }
});

describe("domestic RSS source adapters", () => {
  it("skips an unconfigured official source without making a network request", async () => {
    process.env.KRX_KIND_RSS_URL = "";
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const result = await fetchDomesticRss("KRX_KIND");
    expect(result).toMatchObject({ source: "KRX_KIND", items: [], responseStatus: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(domesticRssConfig("KRX_KIND").configured).toBe(false);
  });

  it("calls the configured source and normalizes the response", async () => {
    process.env.MK_RSS_URL = "https://example.test/mk.xml";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(
      "<rss><channel><item><guid>mk-1</guid><title>테스트 기사</title><link>https://example.test/1</link><pubDate>2026-09-04T00:00:00Z</pubDate><description>요약</description></item></channel></rss>",
      { status: 200, headers: { "content-type": "application/rss+xml" } },
    ));
    const result = await fetchDomesticRss("MK");
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ id: "mk-1", source: "MK", title: "테스트 기사", summary: "요약" });
    expect(result.rawPayload).toContain("mk-1");
  });

  it("isolates a failed source while returning other source results", async () => {
    process.env.NEWSIS_RSS_URL = "https://example.test/newsis.xml";
    process.env.MK_RSS_URL = "https://example.test/mk.xml";
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (String(input).includes("newsis")) throw new Error("network error");
      return new Response("<rss><channel><item><guid>mk-2</guid><title>정상</title></item></channel></rss>", { status: 200 });
    });
    const result = await fetchAllDomesticRss();
    expect(result.results.find((item) => item.source === "NEWSIS")).toMatchObject({ ok: false });
    expect(result.results.find((item) => item.source === "MK")).toMatchObject({ ok: true, skipped: false });
  });
});
