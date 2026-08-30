import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/inquiries", () => ({ getInquiry: vi.fn().mockResolvedValue(null) }));
import { GET } from "./route";
describe("inquiry detail API", () => { it("returns 404 for invalid/nonexistent ids", async () => { const response=await GET(new Request("http://localhost"),{params:Promise.resolve({id:"not-a-number"})}); expect(response.status).toBe(404); }); });
