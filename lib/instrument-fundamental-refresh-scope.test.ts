import { describe, expect, it } from "vitest";
import { assertInstrumentFundamentalRefreshScopeMatches, findDuplicateInstrumentFundamentalUniverseEntries, fingerprintInstrumentFundamentalRefreshScope } from "./instrument-fundamental-refresh-scope";

describe("instrument fundamental refresh scope fingerprint", () => {
  it("identifies duplicate market/code entries across source universes deterministically", () => {
    const entries = [
      { market: "NAS", code: "DUP", source: "us_common_stock_universe" },
      { market: "NAS", code: "UNIQUE", source: "us_common_stock_universe" },
      { market: "NAS", code: "DUP", source: "kr_common_stock_universe" },
    ];
    expect(findDuplicateInstrumentFundamentalUniverseEntries(entries)).toEqual([
      { market: "NAS", code: "DUP", sources: ["kr_common_stock_universe", "us_common_stock_universe"] },
    ]);
  });

  it("does not report a unique market/code entry as a duplicate", () => {
    expect(findDuplicateInstrumentFundamentalUniverseEntries([
      { market: "KOSPI", code: "000001", source: "kr_common_stock_universe" },
    ])).toEqual([]);
  });

  it("is stable regardless of row ordering", () => {
    const rows = [
      { market: "NAS", code: "AMRO", reason: "missing_history" },
      { market: "NAS", code: "NWCL", reason: "invalid_market_cap" },
    ];
    expect(fingerprintInstrumentFundamentalRefreshScope(rows))
      .toBe(fingerprintInstrumentFundamentalRefreshScope([...rows].reverse()));
  });

  it("changes when a ticker or its invalidity reason changes", () => {
    const original = [{ market: "NAS", code: "AMRO", reason: "missing_history" }];
    expect(fingerprintInstrumentFundamentalRefreshScope(original))
      .not.toBe(fingerprintInstrumentFundamentalRefreshScope([{ ...original[0], code: "OTHER" }]));
    expect(fingerprintInstrumentFundamentalRefreshScope(original))
      .not.toBe(fingerprintInstrumentFundamentalRefreshScope([{ ...original[0], reason: "invalid_price" }]));
  });

  it("rejects a retry scope whose count matches but instrument identity changed", () => {
    const expected = [{ market: "NAS", code: "AMRO", reason: "stale_snapshot" }];
    const fingerprint = fingerprintInstrumentFundamentalRefreshScope(expected);

    expect(() => assertInstrumentFundamentalRefreshScopeMatches(
      [{ market: "NYS", code: "NWCL", reason: "stale_snapshot" }],
      1,
      fingerprint,
    )).toThrow("no KIS calls made");
  });

  it("accepts only the reviewed retry count and exact fingerprint", () => {
    const expected = [{ market: "NAS", code: "AMRO", reason: "stale_snapshot" }];
    const fingerprint = fingerprintInstrumentFundamentalRefreshScope(expected);

    expect(assertInstrumentFundamentalRefreshScopeMatches(expected, 1, fingerprint)).toBe(fingerprint);
  });

  it("rejects an empty apply scope even when the approved count and fingerprint match", () => {
    const fingerprint = fingerprintInstrumentFundamentalRefreshScope([]);
    expect(() => assertInstrumentFundamentalRefreshScopeMatches([], 0, fingerprint))
      .toThrow("empty instrument refresh scope; no KIS calls made");
  });

  it("rejects duplicate instrument identities before a matching fingerprint can authorize duplicate work", () => {
    const duplicate = [
      { market: "NAS", code: "AMRO", reason: "missing_history" },
      { market: "NAS", code: "AMRO", reason: "invalid_market_cap" },
    ];
    expect(() => assertInstrumentFundamentalRefreshScopeMatches(
      duplicate,
      duplicate.length,
      fingerprintInstrumentFundamentalRefreshScope(duplicate),
    )).toThrow("duplicate instrument NAS/AMRO; no KIS calls made");
  });

  it("rejects scopes containing blank identity or reason fields", () => {
    const invalid = [{ market: "NAS", code: " ", reason: "stale_snapshot" }];
    expect(() => assertInstrumentFundamentalRefreshScopeMatches(
      invalid,
      1,
      fingerprintInstrumentFundamentalRefreshScope(invalid),
    )).toThrow("empty market, code, or reason; no KIS calls made");
  });
});
