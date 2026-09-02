import { describe, expect, it } from "vitest";
import { clearUserSessionCookie, validatePassword, validateUsername } from "./user-auth";

describe("user authentication policy", () => {
  it("accepts usernames without format or length restrictions", () => {
    expect(validateUsername("")).toBe(true);
    expect(validateUsername("가나다 이름/기호".repeat(100))).toBe(true);
  });

  it("accepts passwords without length restrictions", () => {
    expect(validatePassword("")).toBe(true);
    expect(validatePassword("p".repeat(1000))).toBe(true);
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
