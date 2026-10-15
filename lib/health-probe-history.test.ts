import { describe, expect, it } from "vitest";
import { getHealthProbeAlerts, type HealthProbeRecord } from "./health-probe-history";

const row = (ok: boolean, duration_ms = 20, checked_at = "2026-10-16T00:00:00.000Z"): HealthProbeRecord => ({ probe_name: "db_connection", duration_ms, ok, error_code: ok ? null : "57014", checked_at });

describe("health probe history alerts", () => {
  it("alerts only after three consecutive failures for a probe", () => {
    expect(getHealthProbeAlerts([row(false), row(false, 20, "2026-10-15T23:55:00Z"), row(false, 20, "2026-10-15T23:50:00Z")])).toMatchObject([{ code: "CONSECUTIVE_FAILURES", probeName: "db_connection" }]);
    expect(getHealthProbeAlerts([row(false), row(true, 20, "2026-10-15T23:55:00Z"), row(false, 20, "2026-10-15T23:50:00Z")])).toEqual([]);
  });

  it("flags a successful probe whose latest latency reaches one second", () => {
    expect(getHealthProbeAlerts([row(true, 1_000)])).toMatchObject([{ code: "SLOW_PROBE", latestDurationMs: 1_000 }]);
    expect(getHealthProbeAlerts([row(true, 999)])).toEqual([]);
  });
});
