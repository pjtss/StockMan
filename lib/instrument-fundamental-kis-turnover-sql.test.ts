import { describe, expect, it } from "vitest";
import { instrumentFundamentalKisTurnoverSql } from "./instrument-fundamental-kis-turnover-sql";

describe("instrumentFundamentalKisTurnoverSql", () => {
  it("matches the persisted KIS parser across all supported output keys and current-value aliases", () => {
    const expression = instrumentFundamentalKisTurnoverSql("h.raw_payload");

    for (const outputKey of ["output", "output1", "output2"]) {
      expect(expression).toContain(`NULLIF(h.raw_payload::jsonb->'${outputKey}', 'null'::jsonb)`);
    }
    expect(expression).toContain("->>'tamt'");
    expect(expression).toContain("->>'tamnt'");
    expect(expression).toContain("->>'pamt'");
    expect(expression).toContain("THEN NULLIF(COALESCE(");
    expect(expression).toContain("ELSE NULLIF(");
  });

  it("only permits the known raw payload SQL columns", () => {
    expect(() => instrumentFundamentalKisTurnoverSql("unsafe; SELECT 1" as "raw_payload"))
      .toThrow("Unsupported raw payload SQL column");
    expect(instrumentFundamentalKisTurnoverSql("raw_payload")).toContain("raw_payload::jsonb");
  });
});
