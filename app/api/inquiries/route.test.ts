import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/inquiries", () => ({ listInquiries: vi.fn().mockResolvedValue([]), createInquiry: vi.fn().mockResolvedValue(7) }));
vi.mock("@/lib/request-identity", () => ({ getRequestIdentity: vi.fn().mockReturnValue({ userKey: "user-test", ip: "unknown", userAgent: "unknown" }), maskIp: (value: string) => value, summarizeUserAgent: (value: string) => value }));
import { POST } from "./route";

describe("inquiry POST API", () => {
  it("rejects malformed JSON and missing values", async () => {
    const malformed = await POST(new Request("http://localhost", { method: "POST", body: "{" }));
    expect(malformed.status).toBe(400);
    const missing = await POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ title: "", content: " " }) }));
    expect(missing.status).toBe(400);
  });
  it("accepts special text and returns a created id", async () => {
    const response = await POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ title: "<b>제목</b>", content: "<script>alert(1)</script>" }) }));
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({ ok: true, id: 7 });
  });
});
