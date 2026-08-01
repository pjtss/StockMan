import { describe, expect, it } from "vitest";
import { buildUsDailyPriceUrl } from "./kis-us-daily-price";

describe("KIS US daily price", () => {
  it("builds the ticker-based daily price request", () => {
    const url = buildUsDailyPriceUrl({ code: "aapl", market: "nas", endDate: "2026-07-31" }, { AUTH: "", KEYB: "" });
    const parsed = new URL(url);
    expect(parsed.pathname).toBe("/uapi/overseas-price/v1/quotations/dailyprice");
    expect(parsed.searchParams.get("EXCD")).toBe("NAS");
    expect(parsed.searchParams.get("SYMB")).toBe("AAPL");
    expect(parsed.searchParams.get("BYMD")).toBe("20260731");
    expect(parsed.searchParams.get("GUBN")).toBe("0");
  });

  it("defaults to adjusted prices", () => {
    const url = buildUsDailyPriceUrl({ code: "TSLA", market: "NYS" });
    expect(new URL(url).searchParams.get("MODP")).toBe("1");
  });
});

