import { describe, expect, it } from "vitest";
import { findDoubleEscapedBearerParsers } from "./audit-bearer-auth.mjs";

describe("Bearer parser source audit", () => {
  it("flags a regex that matches a literal backslash-s instead of whitespace", () => {
    expect(findDoubleEscapedBearerParsers([
      { file: "bad/route.ts", content: String.raw`replace(/^Bearer\\s+/i, "")` },
    ])).toEqual(["bad/route.ts"]);
  });

  it("allows the whitespace regex used by valid Bearer parsers", () => {
    expect(findDoubleEscapedBearerParsers([
      { file: "good/route.ts", content: String.raw`replace(/^Bearer\s+/i, "")` },
    ])).toEqual([]);
  });
});
