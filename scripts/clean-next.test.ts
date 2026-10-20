import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveNextOutputDir } from "./clean-next.mjs";

describe("resolveNextOutputDir", () => {
  it("uses the explicit development output before environment/default values", () => {
    expect(resolveNextOutputDir({ cwd: "C:/project", cliDir: ".next-dev", envDir: ".next" }))
      .toBe(resolve("C:/project", ".next-dev"));
  });

  it("uses NEXT_DIST_DIR when no explicit directory is passed", () => {
    expect(resolveNextOutputDir({ cwd: "C:/project", envDir: ".next-custom" }))
      .toBe(resolve("C:/project", ".next-custom"));
  });

  it("falls back to .next only when no directory is configured", () => {
    expect(resolveNextOutputDir({ cwd: "C:/project" })).toBe(resolve("C:/project", ".next"));
  });

  it.each(["..", "../outside", "C:/outside", "build", ".next/child"]) (
    "rejects unsafe cleanup target %s",
    (target) => {
      expect(() => resolveNextOutputDir({ cwd: "C:/project", cliDir: target })).toThrow(
        "only accepts a .next or .next-* directory name",
      );
    },
  );

  it("keeps predev cleanup and the development server on the same distDir", () => {
    const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8"));
    const devServer = readFileSync(resolve(process.cwd(), "scripts/dev-server.mjs"), "utf8");

    expect(packageJson.scripts.predev).toBe("node scripts/clean-next.mjs .next-dev");
    expect(devServer).toContain('env.NEXT_DIST_DIR = ".next-dev"');
  });
});
