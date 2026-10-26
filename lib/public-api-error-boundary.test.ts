import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const publicRoutes = [
  "app/api/bullish-rss/route.ts",
  "app/api/domestic-financial-export/route.ts",
  "app/api/stock/kr/top-rising-chart/route.ts",
  "app/api/scan/daytrade/route.ts",
  "app/api/us/sec-risks/route.ts",
];

describe("public API error boundary source audit", () => {
  it.each(publicRoutes)("does not return free-form exception text: %s", (relativePath) => {
    const source = readFileSync(join(process.cwd(), relativePath), "utf8");
    expect(source).toContain("safeErrorMetadata");
    expect(source).not.toMatch(/(?:error|detail)\s*:\s*error\s+instanceof\s+Error\s*\?\s*error\.message/);
    expect(source).not.toMatch(/(?:error|detail)\s*:\s*String\(error\)/);
  });
});
