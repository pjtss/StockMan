import { loadFeatureModuleSettings, saveFeatureModuleSettings } from "./feature-module-settings";

export const DEFAULT_AUTOMATION_INTERVAL_SECONDS = 30;
export const DEFAULT_MFI_THRESHOLD = 30;
export const DEFAULT_OBV_SIGNAL_PERIOD = 9;
export const DEFAULT_OBV_SIGNAL_ABOVE_DAYS = 3;
export const DEFAULT_OBV_SIGNAL_CROSS_LOOKBACK = 5;

/**
 * 공개 피드 폴링과 기존 호출부가 사용하는 최소 호환 계층이다.
 * 저장소의 단일 진실 공급원은 feature_module_settings이다.
 */
export async function getAutomationIntervalSeconds() {
  try {
    const settings = await loadFeatureModuleSettings("us-scanners");
    return Math.max(5, Math.min(3600, Number(settings.intervalSeconds ?? DEFAULT_AUTOMATION_INTERVAL_SECONDS)));
  } catch {
    return DEFAULT_AUTOMATION_INTERVAL_SECONDS;
  }
}

export async function getMfiThreshold() {
  try {
    const settings = await loadFeatureModuleSettings("us-daily-indicators");
    return Math.max(0, Math.min(100, Number(settings.featureSettings?.evaluation?.mfiThreshold ?? DEFAULT_MFI_THRESHOLD)));
  } catch {
    return DEFAULT_MFI_THRESHOLD;
  }
}

export async function saveMfiThreshold(threshold: number) {
  const value = Math.max(0, Math.min(100, Math.round(threshold)));
  const settings = await loadFeatureModuleSettings("us-daily-indicators");
  await saveFeatureModuleSettings("us-daily-indicators", {
    ...settings,
    featureSettings: {
      ...settings.featureSettings,
      evaluation: { ...settings.featureSettings?.evaluation, mfiThreshold: value },
    },
  });
  return value;
}

export type UsDailyObvSignalPolicy = {
  signalPeriod: number;
  aboveDays: number;
  crossLookback: number;
};

export async function getUsDailyObvSignalPolicy(): Promise<UsDailyObvSignalPolicy> {
  try {
    const settings = await loadFeatureModuleSettings("us-daily-indicators");
    const evaluation = settings.featureSettings?.evaluation;
    return {
      signalPeriod: Math.max(2, Math.min(100, Math.floor(Number(evaluation?.obvSignalPeriod ?? DEFAULT_OBV_SIGNAL_PERIOD)))),
      aboveDays: Math.max(1, Math.min(20, Math.floor(Number(evaluation?.obvSignalAboveDays ?? DEFAULT_OBV_SIGNAL_ABOVE_DAYS)))),
      crossLookback: Math.max(1, Math.min(30, Math.floor(Number(evaluation?.obvSignalCrossLookback ?? DEFAULT_OBV_SIGNAL_CROSS_LOOKBACK)))),
    };
  } catch {
    return { signalPeriod: DEFAULT_OBV_SIGNAL_PERIOD, aboveDays: DEFAULT_OBV_SIGNAL_ABOVE_DAYS, crossLookback: DEFAULT_OBV_SIGNAL_CROSS_LOOKBACK };
  }
}

export async function saveAutomationIntervalSeconds(seconds: number) {
  const value = Math.max(5, Math.min(3600, Math.round(seconds)));
  const settings = await loadFeatureModuleSettings("us-scanners");
  await saveFeatureModuleSettings("us-scanners", { ...settings, intervalSeconds: value });
  return value;
}
