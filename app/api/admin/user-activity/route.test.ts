import { describe, expect, it, vi } from "vitest";

const allowed = vi.hoisted(() => ({ value: false }));
const load = vi.hoisted(() => vi.fn().mockResolvedValue({ hours: 24, summary: { requests: 0, users: 0, ips: 0, errors: 0 }, paths: [], users: [], recent: [] }));
vi.mock("@/lib/admin-auth", () => ({ requireAdminSession: vi.fn(async () => allowed.value) }));
vi.mock("@/lib/user-activity-dashboard", () => ({ loadUserActivityDashboard: load }));
import { GET } from "./route";

describe("user activity dashboard API", () => {
  it("requires an administrator session", async () => {
    allowed.value = false;
    expect((await GET(new Request("http://localhost/api/admin/user-activity"))).status).toBe(401);
  });
  it("loads activity data for an administrator", async () => {
    allowed.value = true;
    const response = await GET(new Request("http://localhost/api/admin/user-activity?hours=48&limit=20"));
    expect(response.status).toBe(200);
    expect(load).toHaveBeenCalledWith(48, 20);
  });
});
