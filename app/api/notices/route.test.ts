import { describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ allowed: false }));
const create = vi.hoisted(() => vi.fn().mockResolvedValue(7));
vi.mock("@/lib/admin-auth", () => ({ requireAdminSession: vi.fn(async () => session.allowed) }));
vi.mock("@/lib/notices", () => ({ createNotice: create }));
import { POST } from "./route";

describe("notice creation API", () => {
  it("rejects non-admin requests", async () => {
    session.allowed = false;
    const response = await POST(new Request("http://localhost/api/notices", { method: "POST", body: JSON.stringify({ title: "공지", content: "내용" }) }));
    expect(response.status).toBe(401);
    expect(create).not.toHaveBeenCalled();
  });

  it("creates a notice for an administrator", async () => {
    session.allowed = true;
    const response = await POST(new Request("http://localhost/api/notices", { method: "POST", body: JSON.stringify({ title: "공지", content: "내용" }) }));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ ok: true, id: 7 });
    expect(create).toHaveBeenCalledWith("공지", "내용");
  });
});
