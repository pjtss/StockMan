import { describe, expect, it } from "vitest";
import { chooseTopRisingRows, chooseTopRisingResponses, isCompleteUsTopRisingMarket, parseKisSourceRank, parseOptionalKisNumber, retainOfficialCommonStocks, selectIntradayFocusKeys } from "./us-top-rising-universe";

describe("US TOP rising response selection", () => {
  it("preserves missing numeric values as null and honors a provider rank when present", () => {
    expect(parseOptionalKisNumber(undefined)).toBeNull();
    expect(parseOptionalKisNumber("  ")).toBeNull();
    expect(parseOptionalKisNumber("0")).toBe(0);
    expect(parseOptionalKisNumber("+12.5")).toBe(12.5);
    expect(parseOptionalKisNumber("1,234")).toBe(1234);
    expect(parseKisSourceRank({ rank: "17" }, 3)).toBe(17);
    expect(parseKisSourceRank({}, 3)).toBe(3);
  });

  it("prefers the full VOL_RANG=0 page when KIS returns a successful partial page", () => {
    const primary = { output2: [{ symb: "SSM" }, { symb: "CPOP" }] };
    const fallback = { output2: Array.from({ length: 100 }, (_, index) => ({ symb: `T${index}` })) };

    const result = chooseTopRisingRows(primary, fallback);

    expect(result.fallbackUsed).toBe(true);
    expect(result.rows).toHaveLength(100);
  });

  it("keeps a complete primary page without replacing it", () => {
    const primary = { output2: Array.from({ length: 100 }, (_, index) => ({ symb: `T${index}` })) };
    const fallback = { output2: [{ symb: "OTHER" }] };

    const result = chooseTopRisingRows(primary, fallback);

    expect(result.fallbackUsed).toBe(false);
    expect(result.rows).toEqual(primary.output2);
  });

  it("does not replace valid primary rows with a failed fallback payload", () => {
    const primary = { status: 200, response: { parsed: { rt_cd: "0", output2: [{ symb: "AAA" }, { symb: "BBB" }] } } };
    const failedFallback = { status: 200, response: { parsed: { rt_cd: "1", output2: Array.from({ length: 100 }, (_, index) => ({ symb: `BAD${index}` })) } } };

    const result = chooseTopRisingResponses(primary, failedFallback);

    expect(result.response).toBe(primary);
    expect(result.rows.map((row) => row.symb)).toEqual(["AAA", "BBB"]);
    expect(result.fallbackUsed).toBe(false);
  });

  it("uses a successful fallback when the primary request failed", () => {
    const failedPrimary = { status: 503, response: { parsed: { rt_cd: "1", output2: [{ symb: "BAD" }] } } };
    const successfulFallback = { status: 200, response: { parsed: { rt_cd: "0", output2: Array.from({ length: 100 }, (_, index) => ({ symb: `GOOD${index}` })) } } };

    const result = chooseTopRisingResponses(failedPrimary, successfulFallback);

    expect(result.response).toBe(successfulFallback);
    expect(result.rows).toHaveLength(100);
    expect(result.fallbackUsed).toBe(true);
  });

  it("marks a market complete only after a successful 100-row source response", () => {
    expect(isCompleteUsTopRisingMarket({ status: 200, rtCd: "0", sourceCount: 1 })).toBe(false);
    expect(isCompleteUsTopRisingMarket({ status: 200, rtCd: "1", sourceCount: 100 })).toBe(false);
    expect(isCompleteUsTopRisingMarket({ status: 200, rtCd: "0", sourceCount: 100 })).toBe(true);
  });
});

describe("official US common-stock eligibility", () => {
  it("retains only keys proven by the active common-stock universe", () => {
    const scopes = [
      { market: "NAS", code: "COMMON" },
      { market: "NAS", code: "ETF" },
      { market: "NYS", code: "INACTIVE" },
    ];

    expect(retainOfficialCommonStocks(scopes, new Set(["NAS:COMMON"]))).toEqual([scopes[0]]);
  });

  it("fails closed when the authoritative set is empty", () => {
    expect(retainOfficialCommonStocks([{ market: "NAS", code: "CPOP" }], new Set())).toEqual([]);
  });
});

describe("US focus-pool selection", () => {
  it("prioritizes scored candidates and fills remaining slots in source rank order for minute queries", () => {
    const scopes = [
      { market: "NAS", code: "NO_CAP" },
      { market: "NAS", code: "NO_TURNOVER" },
      { market: "NAS", code: "SCORED_1" },
      { market: "NYS", code: "SCORED_2" },
    ];
    const score = { market: "NAS", code: "SCORED_1", priority: 12 } as any;
    const otherScore = { market: "NYS", code: "SCORED_2", priority: 11 } as any;
    const scores = new Map([
      ["NAS:SCORED_1", score],
      ["NYS:SCORED_2", otherScore],
    ]);

    expect(selectIntradayFocusKeys(scopes, scores, 3)).toEqual(new Set(["NAS:SCORED_1", "NYS:SCORED_2", "NAS:NO_CAP"]));
  });

  it("balances a source-ordered TOP100 fallback across exchanges when ranking values are missing", () => {
    const scopes = [
      ...Array.from({ length: 40 }, (_, index) => ({ market: "NAS", code: `N${index + 1}`, rank: index + 1 })),
      ...Array.from({ length: 40 }, (_, index) => ({ market: "AMS", code: `A${index + 1}`, rank: index + 1 })),
      ...Array.from({ length: 40 }, (_, index) => ({ market: "NYS", code: `Y${index + 1}`, rank: index + 1 })),
    ];
    const selected = selectIntradayFocusKeys(scopes, new Map(), 30);
    expect(selected.size).toBe(30);
    expect([...selected].filter((key) => key.startsWith("NAS:")).length).toBe(10);
    expect([...selected].filter((key) => key.startsWith("AMS:")).length).toBe(10);
    expect([...selected].filter((key) => key.startsWith("NYS:")).length).toBe(10);
    expect([...selected].slice(0, 6)).toEqual(["NAS:N1", "AMS:A1", "NYS:Y1", "NAS:N2", "AMS:A2", "NYS:Y2"]);
  });

  it("redistributes unused fallback slots when one exchange has fewer eligible stocks", () => {
    const scopes = [
      { market: "NAS", code: "N1", rank: 1 },
      { market: "AMS", code: "A1", rank: 1 },
      { market: "NYS", code: "Y1", rank: 1 },
      { market: "NAS", code: "N2", rank: 2 },
      { market: "NYS", code: "Y2", rank: 2 },
    ];
    expect(selectIntradayFocusKeys(scopes, new Map(), 5)).toEqual(new Set(["NAS:N1", "AMS:A1", "NYS:Y1", "NAS:N2", "NYS:Y2"]));
  });
});
