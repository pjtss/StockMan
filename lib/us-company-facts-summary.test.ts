import { describe, expect, it } from "vitest";
import { summarizeSecCompanyFacts } from "./us-company-facts-summary";

describe("summarizeSecCompanyFacts", () => {
  it("returns the latest standard-tag facts with their filing and period metadata", () => {
    const payload = {
      entityName: "Example Corp.",
      facts: {
        "us-gaap": {
          RevenueFromContractWithCustomerExcludingAssessedTax: {
            units: { USD: [
              { val: 100, start: "2024-01-01", end: "2024-03-31", filed: "2024-05-01", form: "10-Q", accn: "0001", fy: 2024, fp: "Q1" },
              { val: 140, start: "2024-04-01", end: "2024-06-30", filed: "2024-08-01", form: "10-Q", accn: "0002", fy: 2024, fp: "Q2" },
            ] },
          },
          CashAndCashEquivalentsAtCarryingValue: {
            units: { USD: [{ val: 900, end: "2024-06-30", filed: "2024-08-01", form: "10-Q", accn: "0002" }] },
          },
        },
      },
    };

    const summary = summarizeSecCompanyFacts(payload, "USD");
    expect(summary?.entityName).toBe("Example Corp.");
    expect(summary?.metrics.revenue).toMatchObject({
      value: "140", unit: "USD", taxonomy: "us-gaap",
      concept: "RevenueFromContractWithCustomerExcludingAssessedTax",
      periodKind: "DURATION", periodStart: "2024-04-01", periodEnd: "2024-06-30",
      filedAt: "2024-08-01", form: "10-Q", accessionNumber: "0002", fiscalYear: 2024, fiscalPeriod: "Q2",
    });
    expect(summary?.metrics.cashAndCashEquivalents).toMatchObject({ value: "900", periodKind: "INSTANT", periodEnd: "2024-06-30" });
    expect(summary?.metrics.operatingIncome).toBeNull();
  });

  it("supports IFRS standard concepts and rejects malformed payloads", () => {
    const payload = {
      facts: {
        "ifrs-full": {
          Revenue: { units: { EUR: [{ val: 55, start: "2025-01-01", end: "2025-03-31", filed: "2025-05-02" }] } },
          OperatingProfitLoss: { units: { EUR: [{ val: 8, start: "2025-01-01", end: "2025-03-31", filed: "2025-05-02" }] } },
          ProfitLoss: { units: { EUR: [{ val: 4, start: "2025-01-01", end: "2025-03-31", filed: "2025-05-02" }] } },
          CashAndCashEquivalents: { units: { EUR: [{ val: 20, end: "2025-03-31", filed: "2025-05-02" }] } },
          CashFlowsFromUsedInOperatingActivities: { units: { EUR: [{ val: 6, start: "2025-01-01", end: "2025-03-31", filed: "2025-05-02" }] } },
        },
      },
    };

    const summary = summarizeSecCompanyFacts(payload, "EUR");
    expect(Object.values(summary?.metrics ?? {}).every((metric) => metric !== null)).toBe(true);
    expect(summary?.metrics.revenue).toMatchObject({ value: "55", unit: "EUR", taxonomy: "ifrs-full", concept: "Revenue" });
    expect(summarizeSecCompanyFacts(null, "USD")).toBeNull();
    expect(summarizeSecCompanyFacts({ facts: [] }, "USD")).toBeNull();
  });
});
