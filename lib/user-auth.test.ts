import { describe, expect, it } from "vitest";
import { clearUserSessionCookie, validatePassword, validateUsername } from "./user-auth";

describe("user authentication policy", () => {
  it("accepts only the documented username format", () => {
    expect(validateUsername("abc" )).toBe(true);
    expect(validateUsername("user_01")).toBe(true);
    expect(validateUsername("ab")).toBe(false);
    expect(validateUsername("user-name")).toBe(false);
    expect(validateUsername("가나다")).toBe(false);
  });

  it("enforces the 8 to 128 character password bounds", () => {
    expect(validatePassword("1234567")).toBe(false);
    expect(validatePassword("12345678")).toBe(true);
    expect(validatePassword("x".repeat(128))).toBe(true);
    expect(validatePassword("x".repeat(129))).toBe(false);
  });

  it("clears the fixed-expiry session cookie without renewal", () => {
    const cleared = clearUserSessionCookie();
    expect(cleared.name).toBe("stockman_session");
    expect(cleared.options).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
  });
});
