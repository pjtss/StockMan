import { getPool } from "./db";

export const DEFAULT_AUTOMATION_INTERVAL_SECONDS = 30;
export const DEFAULT_MFI_THRESHOLD = 30;

export async function getAutomationIntervalSeconds() {
  try {
    const result = await getPool().query<{ interval_seconds: number }>(
      "SELECT interval_seconds FROM automation_settings WHERE key = 'global' LIMIT 1",
    );
    return Math.max(5, Math.min(3600, Number(result.rows[0]?.interval_seconds ?? DEFAULT_AUTOMATION_INTERVAL_SECONDS)));
  } catch {
    return DEFAULT_AUTOMATION_INTERVAL_SECONDS;
  }
}

export async function getMfiThreshold() {
  try {
    const result = await getPool().query<{ mfi_threshold: number }>("SELECT mfi_threshold FROM automation_settings WHERE key = 'global' LIMIT 1");
    return Math.max(0, Math.min(100, Number(result.rows[0]?.mfi_threshold ?? DEFAULT_MFI_THRESHOLD)));
  } catch { return DEFAULT_MFI_THRESHOLD; }
}

export async function saveMfiThreshold(threshold: number) {
  const value = Math.max(0, Math.min(100, Math.round(threshold)));
  await getPool().query("INSERT INTO automation_settings (key, interval_seconds, mfi_threshold, updated_at) VALUES ('global', $1, $2, NOW()) ON CONFLICT (key) DO UPDATE SET mfi_threshold = EXCLUDED.mfi_threshold, updated_at = NOW()", [await getAutomationIntervalSeconds(), value]);
  return value;
}

export async function saveAutomationIntervalSeconds(seconds: number) {
  const value = Math.max(5, Math.min(3600, Math.round(seconds)));
  await getPool().query(
    `INSERT INTO automation_settings (key, interval_seconds, updated_at) VALUES ('global', $1, NOW())
     ON CONFLICT (key) DO UPDATE SET interval_seconds = EXCLUDED.interval_seconds, updated_at = NOW()`,
    [value],
  );
  return value;
}
