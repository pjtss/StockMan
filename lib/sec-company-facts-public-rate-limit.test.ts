import { beforeEach, describe, expect, it } from "vitest";
import { consumeSecCompanyFactsPublicLimit, resetSecCompanyFactsPublicLimitsForTest } from "./sec-company-facts-public-rate-limit";

describe("SEC Company Facts public rate limits", () => {
  beforeEach(resetSecCompanyFactsPublicLimitsForTest);

  it("allows six lookups per client per ten minutes and reports retry time", () => {
    for (let i = 0; i < 6; i += 1) expect(consumeSecCompanyFactsPublicLimit("lookup", "192.0.2.1", 1_000).allowed).toBe(true);
    expect(consumeSecCompanyFactsPublicLimit("lookup", "192.0.2.1", 1_000)).toEqual({ allowed: false, retryAfterSeconds: 600 });
    expect(consumeSecCompanyFactsPublicLimit("lookup", "192.0.2.1", 602_000).allowed).toBe(true);
  });

  it("keeps client buckets independent and enforces the shared lookup ceiling", () => {
    for (let i = 0; i < 6; i += 1) expect(consumeSecCompanyFactsPublicLimit("lookup", "192.0.2.2", 5_000).allowed).toBe(true);
    expect(consumeSecCompanyFactsPublicLimit("lookup", "192.0.2.3", 5_000).allowed).toBe(true);
    for (let i = 1; i <= 113; i += 1) expect(consumeSecCompanyFactsPublicLimit("lookup", `198.51.${Math.floor((i - 1) / 254) + 1}.${((i - 1) % 254) + 1}`, 5_000).allowed).toBe(true);
    expect(consumeSecCompanyFactsPublicLimit("lookup", "203.0.113.1", 5_000)).toEqual({ allowed: false, retryAfterSeconds: 600 });
  });

  it("limits stored-payload reads separately per client", () => {
    for (let i = 0; i < 30; i += 1) expect(consumeSecCompanyFactsPublicLimit("read", "192.0.2.4", 10_000).allowed).toBe(true);
    expect(consumeSecCompanyFactsPublicLimit("read", "192.0.2.4", 10_000).allowed).toBe(false);
    expect(consumeSecCompanyFactsPublicLimit("lookup", "192.0.2.4", 10_000).allowed).toBe(true);
  });
});
