import { describe, expect, it, vi } from "vitest";
const softDelete = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("@/lib/inquiries", () => ({ getInquiry: vi.fn().mockResolvedValue(null), deleteInquiry: softDelete }));
vi.mock("@/lib/admin-auth", () => ({ requireAdminSession: vi.fn().mockResolvedValue(true) }));
import { DELETE, GET } from "./route";
describe("inquiry detail API", () => { it("returns 404 for invalid/nonexistent ids", async () => { const response=await GET(new Request("http://localhost"),{params:Promise.resolve({id:"not-a-number"})}); expect(response.status).toBe(404); }); });
describe("inquiry deletion API", () => { it("uses the soft-delete service for administrators", async () => { const response=await DELETE(new Request("http://localhost"),{params:Promise.resolve({id:"42"})}); expect(response.status).toBe(200); expect(await response.json()).toEqual({ok:true,deleted:true}); expect(softDelete).toHaveBeenCalledWith(42); }); });
