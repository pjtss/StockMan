import { describe, expect, it, vi } from "vitest";
import { classifyFlow, fetchAskingPriceExpectedConclusion, fetchQuoteBalanceRanking, fetchDividendRateRanking, fetchBalanceSheet, fetchTradeParticipationByAmount, fetchLendableByCompany, fetchCurrentConclusion, fetchTimeIndexChartPrice, fetchIndexPrice, fetchIndexDailyPrice, fetchDomesticProductInfo, fetchDomesticStockInfo, fetchDomesticDailyPrice, fetchInvestmentOpinionByBroker, fetchEtfPrice, fetchEtfComponentStockPrice, fetchEtfNavComparison, fetchEtfNavDailyTrend } from "./kis-investor-flow";
import { kisRequest } from "./kis-request-framework";

vi.mock("./kis-request-framework", () => ({ kisRequest: vi.fn() }));

describe("KIS investor flow", () => {
  it("classifies positive, negative and zero net flow", () => {
    expect(classifyFlow(100)).toBe("BUYING");
    expect(classifyFlow(-1)).toBe("SELLING");
    expect(classifyFlow(0)).toBe("NEUTRAL");
  });

  it("does not infer a direction when the API value is unavailable", () => {
    expect(classifyFlow(null)).toBe("UNAVAILABLE");
    expect(classifyFlow(Number.NaN)).toBe("UNAVAILABLE");
  });

  it("normalizes an official two-object output response", async () => {
    vi.mocked(kisRequest).mockResolvedValueOnce({
      response: new Response(null, { status: 200 }),
      parsed: { rt_cd: "0", output1: { total_ask: "10" }, output2: { expected_price: "100" } },
    } as never);
    const result = await fetchAskingPriceExpectedConclusion("token", "005930");
    expect(result.ok).toBe(true);
    expect(result.rows).toEqual([{ expected_price: "100" }]);
  });

  it("uses official endpoint and transaction id for detection and finance APIs", async () => {
    vi.mocked(kisRequest).mockClear();
    vi.mocked(kisRequest).mockResolvedValue({ response: new Response(null, { status: 200 }), parsed: { rt_cd: "0", output: [] } } as never);
    await fetchQuoteBalanceRanking("token");
    await fetchDividendRateRanking("token", "20260101", "20260908");
    await fetchBalanceSheet("token", "005930");
    await fetchTradeParticipationByAmount("token", "005930");
    await fetchLendableByCompany("token", "005930");
    await fetchCurrentConclusion("token", "005930");
    await fetchTimeIndexChartPrice("token", "0001");
    await fetchIndexPrice("token", "0001");
    await fetchIndexDailyPrice("token", "0001", "20260101");
    await fetchDomesticProductInfo("token", "005930");
    await fetchDomesticStockInfo("token", "005930");
    await fetchDomesticDailyPrice("token", "005930");
    await fetchInvestmentOpinionByBroker("token", "005930", "20260101", "20260908");
    await fetchEtfComponentStockPrice("token", "069500");
    await fetchEtfPrice("token", "069500");
    await fetchEtfNavComparison("token", "069500");
    await fetchEtfNavDailyTrend("token", "069500", "20260101", "20260908");
    const calls = vi.mocked(kisRequest).mock.calls;
    expect(calls[0][0].url.pathname).toBe("/uapi/domestic-stock/v1/ranking/quote-balance");
    expect(calls[0][0].trId).toBe("FHPST01720000");
    expect(calls[1][0].url.pathname).toBe("/uapi/domestic-stock/v1/ranking/dividend-rate");
    expect(calls[1][0].trId).toBe("HHKDB13470100");
    expect(calls[2][0].url.pathname).toBe("/uapi/domestic-stock/v1/finance/balance-sheet");
    expect(calls[2][0].trId).toBe("FHKST66430100");
    expect(calls[3][0].url.pathname).toBe("/uapi/domestic-stock/v1/quotations/tradprt-byamt");
    expect(calls[3][0].trId).toBe("FHKST111900C0");
    expect(calls[4][0].url.pathname).toBe("/uapi/domestic-stock/v1/quotations/lendable-by-company");
    expect(calls[4][0].trId).toBe("CTSC2702R");
    expect(calls[5][0].url.pathname).toBe("/uapi/domestic-stock/v1/quotations/inquire-ccnl");
    expect(calls[5][0].trId).toBe("FHKST01010300");
    expect(calls[6][0].url.pathname).toBe("/uapi/domestic-stock/v1/quotations/inquire-time-indexchartprice");
    expect(calls[6][0].trId).toBe("FHKUP03500200");
    expect(calls[7][0].url.pathname).toBe("/uapi/domestic-stock/v1/quotations/inquire-index-price");
    expect(calls[7][0].trId).toBe("FHPUP02100000");
    expect(calls[8][0].url.pathname).toBe("/uapi/domestic-stock/v1/quotations/inquire-daily-indexchartprice");
    expect(calls[8][0].trId).toBe("FHKUP03500100");
    expect(calls[9][0].url.pathname).toBe("/uapi/domestic-stock/v1/quotations/search-info");
    expect(calls[9][0].trId).toBe("CTPF1604R");
    expect(calls[10][0].url.pathname).toBe("/uapi/domestic-stock/v1/quotations/search-stock-info");
    expect(calls[10][0].trId).toBe("CTPF1002R");
    expect(calls[11][0].url.pathname).toBe("/uapi/domestic-stock/v1/quotations/inquire-daily-price");
    expect(calls[11][0].trId).toBe("FHKST01010400");
    expect(calls[12][0].url.pathname).toBe("/uapi/domestic-stock/v1/quotations/invest-opbysec");
    expect(calls[12][0].trId).toBe("FHKST663400C0");
    expect(calls[13][0].url.pathname).toBe("/uapi/etfetn/v1/quotations/inquire-component-stock-price");
    expect(calls[13][0].trId).toBe("FHKST121600C0");
    expect(calls[14][0].url.pathname).toBe("/uapi/etfetn/v1/quotations/inquire-price");
    expect(calls[14][0].trId).toBe("FHPST02400000");
    expect(calls[15][0].url.pathname).toBe("/uapi/etfetn/v1/quotations/nav-comparison-trend");
    expect(calls[15][0].trId).toBe("FHPST02440000");
    expect(calls[16][0].url.pathname).toBe("/uapi/etfetn/v1/quotations/nav-comparison-daily-trend");
    expect(calls[16][0].trId).toBe("FHPST02440200");
  });
});
