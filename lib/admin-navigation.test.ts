import { describe, expect, it } from "vitest";
import { ADMIN_NAV_ITEMS } from "./admin-navigation";

describe("ADMIN_NAV_ITEMS", () => {
  it("keeps admin destinations unique and grouped", () => {
    expect(new Set(ADMIN_NAV_ITEMS.map((item) => item.id)).size).toBe(ADMIN_NAV_ITEMS.length);
    expect(new Set(ADMIN_NAV_ITEMS.map((item) => item.href)).size).toBe(ADMIN_NAV_ITEMS.length);
    expect(ADMIN_NAV_ITEMS.every((item) => item.href.startsWith("/admin"))).toBe(true);
    expect(new Set(ADMIN_NAV_ITEMS.map((item) => item.group))).toEqual(
      new Set(["운영 제어", "API 관리", "SEC 분석"]),
    );
  });
});
