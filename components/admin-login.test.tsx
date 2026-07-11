import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdminLogin } from "./admin-login";

describe("AdminLogin", () => {
  it("renders the shared admin login form", () => {
    render(<AdminLogin />);

    expect(screen.getByRole("heading", { name: "관리자 로그인" })).toBeDefined();
    expect(screen.getByLabelText("비밀번호")).toHaveAttribute("type", "password");
    expect(screen.getByRole("button", { name: "로그인" })).toBeDefined();
  });
});
