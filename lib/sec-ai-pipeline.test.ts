import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { evaluateSecFilingWithAi } from "./sec-ai-evaluator";
import { buildSecAiPayloadFromDocument } from "./sec-ai-payload";
import { parseSecFilingUrl } from "./sec-filing-url";

const broadcomUrl =
  "https://www.sec.gov/Archives/edgar/data/1730168/000119312526295589/d84378d8k.htm?utm_source=chatgpt.com";

const broadcomHtml = `
  <html>
    <body>
      <ix:nonNumeric name="dei:DocumentType">8-K</ix:nonNumeric>
      <ix:nonNumeric name="dei:EntityRegistrantName">Broadcom Inc.</ix:nonNumeric>
      <ix:nonNumeric name="dei:TradingSymbol">AVGO</ix:nonNumeric>
      <ix:nonNumeric name="dei:DocumentPeriodEndDate">July 6, 2026</ix:nonNumeric>
      <ix:nonNumeric name="dei:EntityCentralIndexKey">1730168</ix:nonNumeric>
      <p>Item 8.01 Other Events.</p>
      <p>
        Broadcom Inc. ("Broadcom") and Apple Inc. ("Apple") have agreed to expand their long-standing
        technology collaboration through 2031 by entering into new multi-year long-term agreements for
        Broadcom to develop and supply a range of custom ASIC silicon products for use in multiple
        generations of Apple products.
      </p>
      <p>Cautionary Note Regarding Forward-Looking Statements</p>
      <p>This sentence should not drive the AI payload.</p>
      <p>Item 9.01 Financial Statements and Exhibits.</p>
      <p>Exhibit 99.1 Press release.</p>
      <p>SIGNATURE</p>
    </body>
  </html>
`;

function buildBroadcomPayload() {
  const urlInfo = parseSecFilingUrl(broadcomUrl);
  return buildSecAiPayloadFromDocument(urlInfo.canonicalUrl, broadcomHtml, undefined, urlInfo);
}

describe("SEC AI pipeline", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, OPENAI_API_KEY: "test-openai-key", OPENAI_MODEL: "test-model" };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = originalEnv;
  });

  it("normalizes the Broadcom SEC URL and builds the 8-K event payload", () => {
    const urlInfo = parseSecFilingUrl(broadcomUrl);
    const payload = buildBroadcomPayload();

    expect(urlInfo.canonicalUrl).toBe(
      "https://www.sec.gov/Archives/edgar/data/1730168/000119312526295589/d84378d8k.htm",
    );
    expect(urlInfo.cik).toBe("1730168");
    expect(urlInfo.accessionNumber).toBe("0001193125-26-295589");
    expect(urlInfo.accessionCompact).toBe("000119312526295589");
    expect(urlInfo.documentFile).toBe("d84378d8k.htm");
    expect(payload.formType).toBe("8-K");
    expect(payload.company).toBe("Broadcom Inc.");
    expect(payload.ticker).toBe("AVGO");
    expect(payload.reportDate).toBe("July 6, 2026");
    expect(payload.events).toEqual([
      expect.objectContaining({
        type: "OTHER_EVENT",
        item: "8.01",
        title: "Other Events",
      }),
    ]);
    expect(payload.text).not.toContain("Item 8.01 Other Events");
    expect(payload.text).toContain("Broadcom Inc.");
    expect(payload.text).not.toContain("Financial Statements and Exhibits");
    expect(payload.text).not.toContain("SIGNATURE");
    expect(payload.promptText).toContain("Company: Broadcom Inc.");
    expect(payload.promptText).toContain("Ticker: AVGO");
    expect(payload.promptText).toContain("Form: 8-K");
    expect(payload.promptText).toContain("Report date: July 6, 2026");
    expect(payload.promptText).toContain("Accession: 0001193125-26-295589");
    expect(payload.promptText).toContain("Material filing events:");
    expect(payload.promptText).toContain("Event 1");
    expect(payload.promptText).toContain("Type: OTHER_EVENT");
    expect(payload.promptText).toContain("Item: 8.01");
    expect(payload.promptText).toContain("Title: Other Events");
    expect(payload.promptText).toContain("Text:");
    expect(payload.promptText.match(/Other Events/g)).toHaveLength(1);
  });

  it("requests the final AI schema and normalizes market-data-only fields", async () => {
    process.env.SEC_AI_REQUEST_TIMEOUT_MS = "7000";
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    const payload = buildBroadcomPayload();
    const mockEvaluation = {
      level: "strong_bullish",
      fundamentalScore: "70",
      catalystScore: 65,
      shortTermImpactScore: 45,
      longTermImpactScore: 75,
      confidence: 80,
      noveltyScore: 60,
      surpriseScore: 60,
      alreadyPricedInRisk: 35,
      materialityScore: 50,
      summary:
        "브로드컴과 애플의 장기 기술 협력 확대는 장기 펀더멘털에 긍정적이지만 계약 규모가 공개되지 않아 단기 급등 판단에는 제한이 있다.",
      facts: [
        "Broadcom Inc. and Apple Inc. have agreed to expand their long-standing technology collaboration through 2031.",
        "Broadcom will develop and supply custom ASIC silicon products for multiple generations of Apple products.",
      ],
      inferences: ["장기 매출 가시성이 개선될 가능성이 있다."],
      unknowns: [
        "계약 금액이 공개되지 않았다.",
        "최소 구매량이 공개되지 않았다.",
        "예상 매출 기여도가 공개되지 않았다.",
        "시장 기대치 데이터가 없다.",
        "공시 전후 주가 및 거래량 데이터가 없다.",
      ],
      eventRisks: ["기술 변화 위험", "경쟁사 등장 위험"],
      analysisLimitations: ["계약 금액이 공개되지 않아 기업 규모 대비 재무적 중요도를 판단하기 어렵다."],
      marketImpact: "장기적으로는 긍정적이나 단기 급등 촉매 강도는 계약 규모 부재로 제한된다.",
      timeHorizon: {
        immediate: "unknown",
        shortTerm: "positive",
        longTerm: "strong_positive",
      },
      requiresMarketData: false,
      recommendedNextChecks: ["공시 직후 거래량 변화 확인"],
    };

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ output_text: JSON.stringify(mockEvaluation) }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await evaluateSecFilingWithAi(payload);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const schema = body.text.format.schema;

    expect(schema.required).toContain("fundamentalScore");
    expect(schema.required).toContain("catalystScore");
    expect(schema.required).toContain("shortTermImpactScore");
    expect(schema.required).toContain("longTermImpactScore");
    expect(schema.required).toContain("facts");
    expect(schema.required).toContain("inferences");
    expect(schema.required).toContain("unknowns");
    expect(schema.required).toContain("eventRisks");
    expect(schema.required).toContain("analysisLimitations");
    expect(schema.required).toContain("requiresMarketData");
    expect(schema.required).toContain("recommendedNextChecks");
    expect(schema.required).not.toContain("score");
    expect(schema.required).not.toContain("risks");
    expect(body.max_output_tokens).toBe(6000);
    expect(timeoutSpy).toHaveBeenCalledWith(7000);
    expect(fetchMock.mock.calls[0][1].signal).toBeDefined();
    expect(schema.properties.level.enum).toEqual(["bullish", "bearish", "neutral", "mixed", "insufficient_data"]);
    expect(schema.properties.timeHorizon.required).toEqual(["immediate", "shortTerm", "longTerm"]);
    expect(body.instructions).toContain("좋은 뉴스와 단기 급등 뉴스는 다르다.");
    expect(body.instructions).toContain("generic risk를 만들지 마라.");
    expect(body.input).toContain("Events metadata:");
    expect(body.input).toContain("Type: OTHER_EVENT");

    expect(result.skipped).toBe(false);
    if (!result.skipped) {
      expect(result.evaluation.level).toBe("bullish");
      expect(result.evaluation.fundamentalScore).toBe(70);
      expect(result.evaluation.surpriseScore).toBeNull();
      expect(result.evaluation.alreadyPricedInRisk).toBeNull();
      expect(result.evaluation.materialityScore).toBeNull();
      expect(result.evaluation.facts[0]).toContain("Broadcom Inc. and Apple Inc.");
      expect(result.evaluation.inferences[0]).toContain("가능성");
      expect(result.evaluation.unknowns).toContain("계약 금액이 공개되지 않았다.");
      expect(result.evaluation.eventRisks).toEqual([]);
      expect(result.evaluation.analysisLimitations).toContain("시장 기대치 데이터가 없어 surpriseScore를 계산할 수 없다.");
      expect(result.evaluation.analysisLimitations).toContain(
        "공시 전후 주가와 거래량 데이터가 없어 alreadyPricedInRisk를 계산할 수 없다.",
      );
      expect(result.evaluation.requiresMarketData).toBe(true);
      expect(result.evaluation.recommendedNextChecks.length).toBeGreaterThan(0);
      expect(result.evaluation.timeHorizon).toEqual({
        immediate: "insufficient_data",
        shortTerm: "positive",
        longTerm: "strong_positive",
      });
    }
  });

  it("returns a stable skip result when the OpenAI request times out", async () => {
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(AbortSignal.abort(new DOMException("timeout", "TimeoutError")));
    const fetchMock = vi.fn().mockRejectedValue(new DOMException("timeout", "TimeoutError"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await evaluateSecFilingWithAi(buildBroadcomPayload());

    expect(result).toEqual({ skipped: true, reason: "OpenAI evaluation request timed out" });
  });

  it("rejects an OpenAI response larger than the configured byte ceiling", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json", "content-length": "524289" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await evaluateSecFilingWithAi(buildBroadcomPayload());

    expect(result).toEqual({ skipped: true, reason: "OpenAI evaluation response exceeded 512 KiB" });
  });

  it("enforces the OpenAI response byte ceiling when content-length is absent", async () => {
    const oversized = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(300 * 1024));
        controller.enqueue(new Uint8Array(300 * 1024));
        controller.close();
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(oversized, { status: 200, headers: { "content-type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await evaluateSecFilingWithAi(buildBroadcomPayload());

    expect(result).toEqual({ skipped: true, reason: "OpenAI evaluation response exceeded 512 KiB" });
  });

  it("preserves raw text when the AI output is not JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ output_text: "not-json" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await evaluateSecFilingWithAi(buildBroadcomPayload());

    expect(result.skipped).toBe(true);
    if (result.skipped) {
      expect(result.reason).toBe("AI evaluation JSON parse failed");
      expect(result.rawText).toBe("not-json");
    }
  });
});
