import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const mocks = vi.hoisted(() => ({ getHealthSnapshot: vi.fn() }));

vi.mock("@/lib/health-check", () => ({ getHealthSnapshot: mocks.getHealthSnapshot }));

import HealthCheckPage from "./page";

function snapshot(automationHistoryAvailable: boolean) {
  return {
    status: "ok",
    checkedAt: "2026-10-15T00:00:00.000Z",
    service: { name: "stockman", version: "1", commit: "test", node: "node", uptimeSeconds: 1 },
    database: { missingTables: [], flywayVersion: "149", latencyMs: 1 },
    checks: { databaseConnection: true, schema: true, flyway: true, requiredEnv: true },
    environment: {},
    automationHistoryAvailable,
    automationCoverage: { expected: ["automation-a"], observed: [], neverRun: automationHistoryAvailable ? ["automation-a"] : [] },
    automation: {},
    cacheAutomation: {},
  };
}

describe("health-check page history states", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows unavailable when history queries fail", async () => {
    mocks.getHealthSnapshot.mockResolvedValue(snapshot(false));

    const html = renderToStaticMarkup(await HealthCheckPage());

    expect(html).toContain("이력 조회 실패");
    expect(html).not.toContain("등록된 모든 자동화에 실행 이력이 있습니다.");
  });

  it("shows no history only when the history query succeeded with no rows", async () => {
    mocks.getHealthSnapshot.mockResolvedValue(snapshot(true));

    const html = renderToStaticMarkup(await HealthCheckPage());

    expect(html).toContain("실행 이력 없음");
    expect(html).not.toContain("이력 조회 실패");
  });
});
