import { describe, expect, it, vi } from "vitest";

const { reportProductionError } = vi.hoisted(() => ({
  reportProductionError: vi.fn().mockResolvedValue({ sent: true }),
}));
vi.mock("@/lib/production-error-reporter", () => ({ reportProductionError }));

import { POST } from "./route";

describe("client error reporting API", () => {
  it("rejects non-JSON requests", async () => {
    const response = await POST(new Request("http://localhost/api/client-errors", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "error",
    }));

    expect(response.status).toBe(415);
    expect(reportProductionError).not.toHaveBeenCalled();
  });

  it("rejects payloads larger than the configured limit", async () => {
    const response = await POST(new Request("http://localhost/api/client-errors", {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": "65537" },
      body: JSON.stringify({ message: "x" }),
    }));

    expect(response.status).toBe(413);
    expect(reportProductionError).not.toHaveBeenCalled();
  });

  it("reports a valid error and truncates oversized fields", async () => {
    const response = await POST(new Request("http://localhost/api/client-errors", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "x".repeat(9000), path: "/".repeat(600) }),
    }));

    expect(response.status).toBe(200);
    expect(reportProductionError).toHaveBeenCalledWith(expect.objectContaining({
      path: "/".repeat(512),
      source: "browser",
      error: expect.any(Error),
    }));
    const error = reportProductionError.mock.calls[0][0].error as Error;
    expect(error.message).toHaveLength(8000);
  });

  it("rejects non-object JSON payloads", async () => {
    const callsBefore = reportProductionError.mock.calls.length;
    const response = await POST(new Request("http://localhost/api/client-errors", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "invalid-payload-test" },
      body: JSON.stringify(["error"]),
    }));

    expect(response.status).toBe(400);
    expect(reportProductionError.mock.calls).toHaveLength(callsBefore);
  });

  it("rate limits repeated reports from one address", async () => {
    const address = "rate-limit-test";
    for (let i = 0; i < 30; i += 1) {
      const response = await POST(new Request("http://localhost/api/client-errors", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": address },
        body: JSON.stringify({ message: "repeated" }),
      }));
      expect(response.status).toBe(200);
    }
    const response = await POST(new Request("http://localhost/api/client-errors", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": address },
      body: JSON.stringify({ message: "repeated" }),
    }));

    expect(response.status).toBe(429);
  });
});
