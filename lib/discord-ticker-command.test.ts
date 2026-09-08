import { describe, expect, it } from "vitest";
import { formatTickerInfo } from "./discord-ticker-command";

describe("Discord /ticker message", () => {
  it("formats domestic amounts in Korean currency units and includes quote fields", () => {
    const message = formatTickerInfo({
      ticker: "005930", market: "KOSPI", name: "삼성전자", price: 70000, rate: 1.2,
      tradingValue: 12_345_000_000, marketCap: 400_000_000_000_000,
      open: 69000, high: 71000, low: 68000, previousClose: 69200, volume: 1000000, bid: 69900, ask: 70000,
    });
    expect(message).toContain("종목명: 삼성전자");
    expect(message).toContain("거래대금: 123.45억");
    expect(message).toContain("시가: 69,000");
    expect(message).toContain("호가: 매수 69,900 · 매도 70,000");
  });

  it("formats overseas market cap and trading value as dollars", () => {
    const message = formatTickerInfo({
      ticker: "AAPL", market: "NAS", name: "Apple", price: 200, rate: -0.5,
      tradingValue: 2_500_000_000, marketCap: 3_000_000_000_000,
      open: null, high: null, low: null, previousClose: null, volume: null, bid: null, ask: null,
    });
    expect(message).toContain("거래대금: $2.5B");
    expect(message).toContain("시가총액: $3T");
    expect(message).toContain("현재가: $200");
    expect(message).toContain("거래량: -");
    expect(message).not.toContain("억");
  });

  it("keeps the response below Discord's content limit", () => {
    const message = formatTickerInfo({
      ticker: "LONG", market: "NAS", name: "x".repeat(5000), price: 1, rate: 0,
      tradingValue: null, marketCap: null, open: null, high: null, low: null,
      previousClose: null, volume: null, bid: null, ask: null,
    });
    expect(message.length).toBeLessThanOrEqual(1900);
    expect(message).toContain("일부 지표가 생략되었습니다");
  });
});
