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

  it("copies only US RSS sources as one JSON payload", async () => {
    const usItem = { id: 1, source: "NASDAQ", title: "US story" };
    const domesticItem = { id: 2, source: "NEWSIS", title: "KR story" };
    const dartItem = { id: 3, source: "DART", title: "Disclosure" };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [usItem, domesticItem, dartItem], total: 3 }) }));
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<DailyDisclosuresPage />);

    await waitFor(() => expect(screen.getByText("3건 전체 조회 완료")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "미국 RSS JSON 복사" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const payload = JSON.parse(writeText.mock.calls[0][0]);
    expect(payload.source).toBe("US_RSS");
    expect(payload.total).toBe(1);
    expect(payload.items).toEqual([usItem]);
    expect(payload.sources).toEqual(["SEC_EDGAR", "NASDAQ", "NASDAQ_TRADER", "STOCKTITAN", "GLOBENEWSWIRE"]);
  });
});
