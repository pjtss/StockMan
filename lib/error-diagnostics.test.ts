import { describe, expect, it } from "vitest";
import { describeError, isSchemaError } from "./error-diagnostics";

describe("error-diagnostics", () => {
  it("unwraps a wrapped PostgreSQL missing-table error", () => {
    const cause = Object.assign(new Error('relation "feature_module_settings" does not exist'), { code: "42P01" });
    const error = Object.assign(new Error("Failed query: select ..."), { cause });
    expect(describeError(error)).toMatchObject({ errorCode: "SCHEMA_TABLE_MISSING", databaseCode: "42P01", table: "feature_module_settings" });
    expect(isSchemaError(error)).toBe(true);
  });

  it("redacts database URLs from integration errors", () => {
    const diagnostics = describeError(new Error("connect failed postgres://user:secret@example.test:5432/stockman"));
    expect(diagnostics.message).not.toContain("secret");
    expect(diagnostics.message).toContain("postgresql://[redacted]");
  });
});
