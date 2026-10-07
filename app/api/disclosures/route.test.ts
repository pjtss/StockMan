import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/disclosures hour validation", () => {
  it("rejects hour ranges outside 1 through 24 before database access", async () => {
    for (const hours of ["0", "25", "1.5", "invalid"]) {
      const response = await GET(new Request(`http://localhost/api/disclosures?hours=${hours}`));
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({ ok: false, error: "INVALID_HOURS", allowed: { min: 1, max: 24 } });
    }
  });
});
