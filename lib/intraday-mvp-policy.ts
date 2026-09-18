import { loadFeatureModuleSettings } from "@/lib/feature-module-settings";

export type IntradayMvpPolicy = { windowMinutes: 1 | 5; thresholdPercent: number; threshold: number; requiredSamples: number; windowMs: number };

export const DEFAULT_INTRADAY_MVP_POLICY: IntradayMvpPolicy = { windowMinutes: 5, thresholdPercent: 5, threshold: 0.05, requiredSamples: 5, windowMs: 300_000 };
const CACHE_TTL_MS = 10 * 60_000;
let cached: { policy: IntradayMvpPolicy; expiresAt: number } | null = null;

export async function loadIntradayMvpPolicy(): Promise<IntradayMvpPolicy> {
  if (cached && cached.expiresAt > Date.now()) return cached.policy;
  try {
    const settings = await loadFeatureModuleSettings("intraday-mvp");
    const configured = settings.featureSettings?.intradayMvpPolicy;
    const windowMinutes = Number(configured?.windowMinutes) === 1 ? 1 : 5;
    const thresholdPercent = Number(configured?.thresholdPercent);
    const safePercent = Number.isFinite(thresholdPercent) && thresholdPercent > 0 && thresholdPercent <= 100 ? thresholdPercent : DEFAULT_INTRADAY_MVP_POLICY.thresholdPercent;
    const policy: IntradayMvpPolicy = { windowMinutes, thresholdPercent: safePercent, threshold: safePercent / 100, requiredSamples: windowMinutes, windowMs: windowMinutes * 60_000 };
    cached = { policy, expiresAt: Date.now() + CACHE_TTL_MS };
    return policy;
  } catch {
    cached = { policy: DEFAULT_INTRADAY_MVP_POLICY, expiresAt: Date.now() + CACHE_TTL_MS };
    return DEFAULT_INTRADAY_MVP_POLICY;
  }
}
export function invalidateIntradayMvpPolicyCache() { cached = null; }
