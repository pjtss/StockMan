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

describe("GET /api/disclosures date validation", () => {
  it("rejects dates that match YYYY-MM-DD but do not exist in the Gregorian calendar before database access", async () => {
    for (const date of ["2026-02-29", "2026-02-30", "2026-04-31", "2026-13-01"]) {
      const response = await GET(new Request(`http://localhost/api/disclosures?date=${date}`));
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({ ok: false, error: "INVALID_DATE" });
    }
  });
});
