import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runFilingSync: vi.fn(),
}));

vi.mock("@/lib/filing-sync", () => ({
  runFilingSync: mocks.runFilingSync,
}));

import { GET, POST } from "./route";

describe("sync-filings cron route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-secret";
    mocks.runFilingSync.mockResolvedValue({
      success: true,
      dart: { skipped: true },
      sec: { source: "SEC", items: [] },
    });
  });

  it.each([
    ["GET", GET],
    ["POST", POST],
  ])("accepts an authorized %s request", async (method, handler) => {
    const response = await handler(
      new Request(`http://localhost/api/cron/sync-filings?secret=test-secret`, {
        method,
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.runFilingSync).toHaveBeenCalledTimes(1);
  });

  it("rejects an invalid cron secret", async () => {
    const response = await POST(
      new Request("http://localhost/api/cron/sync-filings?secret=invalid", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(401);
    expect(mocks.runFilingSync).not.toHaveBeenCalled();
  });
});
