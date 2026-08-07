import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdminDashboard } from "./admin-dashboard";

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin",
}));

describe("AdminDashboard", () => {
  it("renders grouped admin destinations", () => {
    render(<AdminDashboard />);

    expect(screen.getByRole("heading", { name: "관리자 대시보드" })).toBeDefined();
    expect(screen.getByRole("heading", { name: "운영" })).toBeDefined();
    expect(screen.getByRole("heading", { name: "API" })).toBeDefined();
    expect(screen.getByRole("heading", { name: "종목" })).toBeDefined();
    expect(screen.getByRole("heading", { name: "자동화" })).toBeDefined();
    expect(screen.getByRole("heading", { name: "진단" })).toBeDefined();
    expect(screen.getAllByRole("link", { name: /기능 ON\/OFF/ }).some((link) => link.getAttribute("href") === "/admin/features")).toBe(true);
    expect(screen.getAllByRole("link", { name: /SEC 분석 테스트/ }).some((link) => link.getAttribute("href") === "/admin/sec-test")).toBe(true);
  });
});
