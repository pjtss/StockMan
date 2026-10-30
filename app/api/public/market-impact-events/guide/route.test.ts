import { describe, expect, it } from "vitest";

import { GET } from "./route";

describe("GET /api/public/market-impact-events/guide", () => {
  it("returns the versioned Korean event-writing guide without authentication", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.schemaVersion).toBe("market-impact-event-guide.v1");
    expect(body.guideVersion).toBe("1.0.0");
    expect(body.marketSeparation.KR.arrayPath).toBe("markets.KR");
    expect(body.marketSeparation.US.arrayPath).toBe("markets.US");
    expect(body.jsonSchema.properties.markets.required).toEqual(["KR", "US"]);
    expect(response.headers.get("cache-control")).toContain("max-age=300");
  });
});
