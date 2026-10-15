export type HealthProbeRecord = {
  probe_name: string;
  duration_ms: number;
  ok: boolean;
  error_code: string | null;
  checked_at: string;
};

export const HEALTH_PROBE_SLOW_MS = 1_000;
export const HEALTH_PROBE_FAILURE_STREAK = 3;

export function getHealthProbeAlerts(records: HealthProbeRecord[]) {
  const grouped = new Map<string, HealthProbeRecord[]>();
  for (const record of records) {
    const list = grouped.get(record.probe_name) || [];
    list.push(record);
    grouped.set(record.probe_name, list);
  }

  return [...grouped.entries()].flatMap(([probeName, values]) => {
    const ordered = [...values].sort((a, b) => Date.parse(b.checked_at) - Date.parse(a.checked_at));
    const latest = ordered[0];
    const failures = ordered.slice(0, HEALTH_PROBE_FAILURE_STREAK);
    const alerts: Array<{ probeName: string; code: string; message: string; latestDurationMs: number }> = [];
    if (failures.length === HEALTH_PROBE_FAILURE_STREAK && failures.every((row) => !row.ok)) {
      alerts.push({ probeName, code: "CONSECUTIVE_FAILURES", message: `최근 ${HEALTH_PROBE_FAILURE_STREAK}회 연속 실패`, latestDurationMs: latest.duration_ms });
    }
    if (latest?.ok && latest.duration_ms >= HEALTH_PROBE_SLOW_MS) {
      alerts.push({ probeName, code: "SLOW_PROBE", message: `최근 응답 ${latest.duration_ms}ms (기준 ${HEALTH_PROBE_SLOW_MS}ms)`, latestDurationMs: latest.duration_ms });
    }
    return alerts;
  });
}
