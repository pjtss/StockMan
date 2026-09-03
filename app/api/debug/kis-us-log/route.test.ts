import { describe, expect, it, vi } from "vitest";

const allowed = vi.hoisted(() => ({ value: false }));
const load = vi.hoisted(() => vi.fn(() => []));
vi.mock("@/lib/admin-auth", () => ({ requireAdminSession: vi.fn(async () => allowed.value) }));
vi.mock("@/lib/kis-us-debug", () => ({ getKisUsDebugLogs: load }));
import { GET } from "./route";

describe("KIS US debug log API", () => {
  it("requires an administrator session", async () => {
    allowed.value = false;
    expect((await GET(new Request("http://localhost/api/debug/kis-us-log"))).status).toBe(401);
  });

  it("accepts only a non-negative safe integer cursor", async () => {
    allowed.value = true;
    load.mockClear();
    expect((await GET(new Request("http://localhost/api/debug/kis-us-log?since=-1"))).status).toBe(200);
    expect(load).toHaveBeenCalledWith(undefined);
    load.mockClear();
    await GET(new Request("http://localhost/api/debug/kis-us-log?since=12"));
    expect(load).toHaveBeenCalledWith(12);
  });
});
