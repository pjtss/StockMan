import { describe, expect, it, vi } from "vitest";
const query = vi.fn();
vi.mock("@/lib/db", () => ({ getPool: () => ({ query }) }));
import { createInquiry, listInquiries } from "./inquiries";

describe("inquiry DB failure handling", () => {
  it("propagates database errors instead of returning fake data", async () => {
    query.mockRejectedValueOnce(new Error("DB timeout"));
    await expect(listInquiries()).rejects.toThrow("DB timeout");
    query.mockRejectedValueOnce(new Error("DB unavailable"));
    await expect(createInquiry("title", "content", { userKey: "u", ip: "1.2.3.4", userAgent: "ua" })).rejects.toThrow("DB unavailable");
  });
});
