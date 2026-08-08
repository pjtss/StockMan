import type { FeatureSpecificSettings } from "./feature-modules";

export type SecEdgarRuntimeConfig = {
  ciks: string[];
  syncXbrl: boolean;
  discordBatch: number;
};

export function normalizeSecCiks(values: unknown): string[] {
  const rawValues = Array.isArray(values) ? values : String(values || "").split(/[\s,]+/);
  return [...new Set(rawValues
    .map((value) => String(value).replace(/\D/g, "").padStart(10, "0"))
    .filter((value) => value !== "0000000000" && value.length === 10))];
}

export function resolveSecEdgarRuntimeConfig(
  featureSettings?: FeatureSpecificSettings,
  environment: Record<string, string | undefined> = process.env,
): SecEdgarRuntimeConfig {
  const configured = featureSettings?.secEdgar;
  const ciks = normalizeSecCiks(configured?.ciks?.length ? configured.ciks : environment.SEC_SYNC_CIKS);
  const syncXbrl = typeof configured?.syncXbrl === "boolean" ? configured.syncXbrl : environment.SEC_SYNC_XBRL === "true";
  const discordBatchValue = configured?.discordBatch ?? Number(environment.SEC_EDGAR_DISCORD_BATCH || 10);
  const discordBatch = Number.isFinite(Number(discordBatchValue)) ? Math.min(100, Math.max(1, Math.trunc(Number(discordBatchValue)))) : 10;
  return { ciks, syncXbrl, discordBatch };
}
