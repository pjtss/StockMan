import { describe, expect, it } from "vitest";
import { kisMarketFromSecExchange } from "./market-news-market-reaction";

describe("market news market reaction", () => {
  it("maps SEC exchange names to KIS market codes", () => {
    expect(kisMarketFromSecExchange("Nasdaq")).toBe("NAS");
    expect(kisMarketFromSecExchange("NYSE")).toBe("NYS");
    expect(kisMarketFromSecExchange("NYSE American")).toBe("AMS");
  });
});
