import { loadFeatureModuleSettings } from "./feature-module-settings";
import type { FeatureModuleKey } from "./feature-modules";

/**
 * 기능 활성화 여부는 feature_module_settings만 읽는다.
 * DB를 일시적으로 사용할 수 없을 때의 기본값은 기존 운영 동작을 보존한다.
 */
const safeDefaults: Partial<Record<FeatureModuleKey, boolean>> = {
  "sec-realtime": false,
};

export async function isFeatureModuleEnabled(key: FeatureModuleKey) {
  try {
    return (await loadFeatureModuleSettings(key)).enabled;
  } catch {
    return safeDefaults[key] ?? true;
  }
}
