import { beforeEach, describe, expect, it, vi } from "vitest";

const { kisRequestMock } = vi.hoisted(() => ({ kisRequestMock: vi.fn() }));
vi.mock("./kis-request-framework", () => ({ kisRequest: kisRequestMock }));

import { fetchKisIpoListingSchedule } from "./kis-ipo-listing-schedule";

describe("KIS IPO listing schedule adapter", () => {
  beforeEach(() => kisRequestMock.mockReset());

  it("builds the official request parameters and uses the shared KIS boundary", async () => {
    const response = { response: { status: 200 }, parsed: { rt_cd: "0", output1: [{ sht_cd: "123456" }] } };
    kisRequestMock.mockResolvedValue(response);

    const result = await fetchKisIpoListingSchedule("token-value", {
      fromDate: "20261001",
      toDate: "20261031",
      stockCode: " 123456 ",
      continuationState: " cursor-1 ",
    });

    expect(result).toBe(response);
    const request = kisRequestMock.mock.calls[0][0];
    const url = new URL(request.url);
    expect(url.pathname).toBe("/uapi/domestic-stock/v1/ksdinfo/list-info");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      SHT_CD: "123456",
      T_DT: "20261031",
      F_DT: "20261001",
      CTS: "cursor-1",
    });
    expect(request).toMatchObject({
      token: "token-value",
      trId: "HHKDB669107C0",
      debug: { feature: "ipo-listing-schedule", market: "KR" },
    });
  });

  it("sends empty optional query values without bypassing the shared boundary", async () => {
    kisRequestMock.mockResolvedValue({ response: { status: 200 }, parsed: { rt_cd: "0", output1: [] } });

    await fetchKisIpoListingSchedule("token-value", { fromDate: "20261001", toDate: "20261031" });

    const request = kisRequestMock.mock.calls[0][0];
    const url = new URL(request.url);
    expect(url.searchParams.get("SHT_CD")).toBe("");
    expect(url.searchParams.get("CTS")).toBe("");
  });
});
