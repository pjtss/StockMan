import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/inquiries", () => ({ createComment: vi.fn() }));
vi.mock("@/lib/request-identity", () => ({ getRequestIdentity: vi.fn().mockReturnValue({ userKey: "u", ip: "unknown", userAgent: "unknown" }) }));
import { POST } from "./route";
describe("comment API", () => { it("rejects invalid JSON shape, blank, and overflow comments", async () => { for (const content of ["", "   ", "x".repeat(2001)]) { const r=await POST(new Request("http://localhost",{method:"POST",body:JSON.stringify({content})}),{params:Promise.resolve({id:"1"})}); expect(r.status).toBe(400); } }); });
