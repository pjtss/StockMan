import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireAdminSession } = vi.hoisted(() => ({ requireAdminSession: vi.fn() }));
vi.mock("@/lib/admin-auth", () => ({ requireAdminSession }));
vi.mock("@/lib/db", () => ({ getPool: vi.fn() }));

import { POST } from "./route";

describe("POST /api/admin/events/{id}/analysis", () => {
  beforeEach(() => requireAdminSession.mockReset().mockResolvedValue(false));

  it("requires an administrator session before accepting writes", async () => {
    const response = await POST(new Request("https://stockman.example/api/admin/events/1/analysis", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ bullishGrade: "A" }),
    }), { params: Promise.resolve({ id: "1" }) });
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: "UNAUTHORIZED" });
  });
});
