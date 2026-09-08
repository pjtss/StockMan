import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/kis/investor-flow", () => {
  it("rejects an invalid stock code before requesting KIS", async () => {
    const response = await GET(new Request("http://localhost/api/kis/investor-flow?code=123"));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("INVALID_STOCK_CODE");
  });
});
