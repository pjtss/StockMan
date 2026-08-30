import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/db", () => ({ getPool: vi.fn() }));
import { POST } from "./route";
describe("request log authentication", () => { it("rejects missing and incorrect secrets before DB access", async () => { vi.stubEnv("REQUEST_LOG_SECRET", "expected"); const missing=await POST(new Request("http://localhost",{method:"POST"})); expect(missing.status).toBe(401); const wrong=await POST(new Request("http://localhost",{method:"POST",headers:{"x-request-log-secret":"wrong"}})); expect(wrong.status).toBe(401); vi.unstubAllEnvs(); }); });
