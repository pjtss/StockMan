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
    expect(screen.getByRole("heading", { name: "운영 제어" })).toBeDefined();
    expect(screen.getByRole("heading", { name: "API 관리" })).toBeDefined();
    expect(screen.getByRole("heading", { name: "SEC 분석" })).toBeDefined();
    expect(screen.getAllByRole("link", { name: /기능 ON\/OFF/ }).some((link) => link.getAttribute("href") === "/admin/features")).toBe(true);
    expect(screen.getAllByRole("link", { name: /SEC 분석 테스트/ }).some((link) => link.getAttribute("href") === "/admin/sec-test")).toBe(true);
  });
});
