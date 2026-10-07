import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DailyDisclosuresPage } from "./daily-disclosures-page";

describe("DailyDisclosuresPage recent-hour filter", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [], total: 0 }) }));
  });

  it("loads the latest hour by default and allows selecting any hour through 24", async () => {
    render(<DailyDisclosuresPage />);
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.stringContaining("hours=1"), { cache: "no-store" }));

    const hoursSelect = screen.getByLabelText("최근 시간");
    expect(hoursSelect.querySelectorAll("option")).toHaveLength(24);
    fireEvent.change(hoursSelect, { target: { value: "24" } });
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.stringContaining("hours=24"), { cache: "no-store" }));
  });

  it("keeps the existing date-based query available", async () => {
    render(<DailyDisclosuresPage />);
    fireEvent.change(screen.getByLabelText("조회 기준"), { target: { value: "date" } });
    await waitFor(() => expect(fetch).toHaveBeenLastCalledWith(expect.stringContaining("date="), { cache: "no-store" }));
    expect(screen.getByLabelText("기준일")).toBeInTheDocument();
  });
});
