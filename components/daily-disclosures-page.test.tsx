import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DailyDisclosuresPage } from "./daily-disclosures-page";

function disclosureResponse(items: Array<Record<string, unknown>>, sourceCoverage: Array<Record<string, unknown>> = []) {
  return {
    items,
    total: items.length,
    queryStatus: items.length ? "DB_QUERY_COMPLETE" : "NO_MATCHING_STORED_ROWS",
    displayTimezone: "Asia/Seoul",
      queryWindow: { kind: "ROLLING_HOURS", from: "2026-11-04T00:00:00.000Z", to: "2026-11-04T01:00:00.000Z", endExclusive: true },
    sourceCoverage,
    page: 1,
    pageSize: 50,
    hasMore: false,
  };
}

describe("DailyDisclosuresPage recent-hour filter", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => disclosureResponse([]) }));
  });

  it("opens source collection and persistence status when the selected query returns no stored rows", async () => {
    const coverage = [{
      source: "DART",
      sourceClass: "OFFICIAL_DISCLOSURE",
      configuredState: "UNKNOWN",
      latestAttempt: { fetchState: "SUCCESS", persistState: "NOT_RUN", fetchedAt: null, observedAt: "2026-11-04T00:30:00.000Z", itemCount: 25, pageCount: 1, failureCode: null },
      lastSuccessfulPersistAt: null,
      rangeCoverage: "UNKNOWN",
    }];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => disclosureResponse([], coverage) }));
    render(<DailyDisclosuresPage />);

    await waitFor(() => expect(screen.getByText("저장된 데이터가 없습니다. 원천 공시가 없다는 뜻은 아닙니다.")).toBeInTheDocument());
    const summary = screen.getByText("출처별 최근 수집·저장 상태");
    expect(summary.closest("details")?.open).toBe(true);
    expect(screen.getByText(/설정 미확인; fetch 성공; 저장 미실행/)).toBeInTheDocument();
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

  it("copies only original links from US RSS sources", async () => {
    const usItem = { id: 1, source: "NASDAQ", title: "US story", link: "https://example.com/us" };
    const domesticItem = { id: 2, source: "NEWSIS", title: "KR story", link: "https://example.com/kr" };
    const dartItem = { id: 3, source: "DART", title: "Disclosure", link: "https://example.com/dart" };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => disclosureResponse([usItem, domesticItem, dartItem]) }));
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<DailyDisclosuresPage />);

    await waitFor(() => expect(screen.getByText("3건 전체 조회 완료")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "미국 RSS 링크 복사" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText.mock.calls[0][0]).toBe("https://example.com/us");
    expect(writeText.mock.calls[0][0]).not.toContain("US story");
  });

  it("copies only newline-separated URLs for all selected disclosures", async () => {
    const rows = [
      { id: 1, source: "NASDAQ", title: "Story", link: "https://example.com/story" },
      { id: 2, source: "DART", title: "Filing", link: "https://example.com/filing" },
      { id: 3, source: "NEWSIS", title: "Missing link" },
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => disclosureResponse(rows) }));
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<DailyDisclosuresPage />);

    await waitFor(() => expect(screen.getByText("3건 전체 조회 완료")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "전체 링크 복사" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText.mock.calls[0][0]).toBe("https://example.com/story\nhttps://example.com/filing");
  });
});
