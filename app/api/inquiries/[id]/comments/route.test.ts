import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/inquiries", () => ({ createComment: vi.fn(), deleteComment: vi.fn() }));
vi.mock("@/lib/request-identity", () => ({ getRequestIdentity: vi.fn().mockReturnValue({ userKey: "u", ip: "unknown", userAgent: "unknown" }) }));
vi.mock("@/lib/admin-auth", () => ({ requireAdminSession: vi.fn().mockResolvedValue(true) }));
import { DELETE, POST } from "./route";
import { deleteComment } from "@/lib/inquiries";
describe("comment API", () => { it("rejects invalid JSON shape, blank, and overflow comments", async () => { for (const content of ["", "   ", "x".repeat(2001)]) { const r=await POST(new Request("http://localhost",{method:"POST",body:JSON.stringify({content})}),{params:Promise.resolve({id:"1"})}); expect(r.status).toBe(400); } }); });
describe("comment deletion", () => { it("accepts DELETE and deletes the requested comment for an administrator", async () => { const r=await DELETE(new Request("http://localhost/api/inquiries/1/comments?commentId=42", { method: "DELETE" })); expect(r.status).toBe(200); expect(deleteComment).toHaveBeenCalledWith(42); }); });
