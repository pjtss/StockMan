import { describe, expect, it } from "vitest";
import { normalizeKrTopRisingRows } from "./kr-top-rising";

describe("normalizeKrTopRisingRows", () => {
  it("normalizes KIS rows and preserves the last-session observation metadata", () => {
    expect(normalizeKrTopRisingRows([
      { data_rank: "1", mksc_shrn_iscd: "005930", hts_kor_isnm: "삼성전자", rprs_mrkt_kor_name: "코스피", prdy_ctrt: "3.12", acml_vol: "1,234", acml_tr_pbmn: "56,789" },
      { data_rank: "2", stck_shrn_iscd: "123456", hts_kor_isnm: "테스트", rprs_mrkt_kor_name: "코스닥", prdy_ctrt: "-1.2" },
    ], "2026-09-19T00:00:00.000Z")).toEqual([
      { market: "KOSPI", code: "005930", name: "삼성전자", rank: 1, rate: 3.12, volume: 1234, tradingValue: 56789, observedAt: "2026-09-19T00:00:00.000Z" },
      { market: "KOSDAQ", code: "123456", name: "테스트", rank: 2, rate: -1.2, volume: undefined, tradingValue: undefined, observedAt: "2026-09-19T00:00:00.000Z" },
    ]);
  });
});
