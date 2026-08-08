import { describe, expect, it } from "vitest";
import { normalizeSecCiks, resolveSecEdgarRuntimeConfig } from "./sec-edgar-config";

describe("SEC EDGAR runtime configuration", () => {
  it("normalizes and deduplicates CIK values", () => {
    expect(normalizeSecCiks(["1855485", "0001855485", "bad"])).toEqual(["0001855485"]);
  });

  it("uses feature settings before environment fallbacks", () => {
    expect(resolveSecEdgarRuntimeConfig({ secEdgar: { ciks: ["0000000001"], syncXbrl: true, discordBatch: 120 } }, { SEC_SYNC_CIKS: "0000000002", SEC_SYNC_XBRL: "false", SEC_EDGAR_DISCORD_BATCH: "5" })).toEqual({ ciks: ["0000000001"], syncXbrl: true, discordBatch: 100 });
  });

  it("uses environment values when feature settings are not configured", () => {
    expect(resolveSecEdgarRuntimeConfig(undefined, { SEC_SYNC_CIKS: "0000000003,0000000004", SEC_SYNC_XBRL: "true", SEC_EDGAR_DISCORD_BATCH: "7" })).toEqual({ ciks: ["0000000003", "0000000004"], syncXbrl: true, discordBatch: 7 });
  });
});
