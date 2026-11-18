import { describe, expect, it } from "vitest";
import { buildStaleRunReconciliationQuery } from "./automation-run-repository";

describe("stale automation run reconciliation query", () => {
  it("casts timeout parameters to numeric before multiplying by an interval", () => {
    const query = buildStaleRunReconciliationQuery();
    expect(query.text).toContain("$2::double precision ELSE $1::double precision");
    expect(query.text).toContain("* INTERVAL '1 second'");
    expect(query.values).toEqual([7200, 18000]);
  });
});
